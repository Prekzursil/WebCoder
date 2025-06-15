from celery import shared_task
from django.db import transaction
from .models import Submission, SubmissionTestResult # Import SubmissionTestResult
from problems.models import Problem, TestCase
import time
import random
import subprocess
import tempfile
import pathlib
import shutil

from .judge_utils.comparison import compare_outputs
from .judge_utils.compilation import compile_code_in_sandbox
from .judge_utils.execution import run_code_in_sandbox
from .judge_utils.checkers import run_custom_checker

@shared_task(bind=True)
def judge_submission_task(self, submission_id):
    temp_dir_obj = None 
    try:
        # Initial transaction to fetch problem and mark submission as COMPILING
        with transaction.atomic():
            submission = Submission.objects.select_for_update().get(id=submission_id)
            if submission.verdict != Submission.VerdictStatus.PENDING:
                return f"Submission {submission_id} not PENDING."
            problem = submission.problem 
            test_cases = TestCase.objects.filter(problem=problem).order_by('order')
            submission.verdict = Submission.VerdictStatus.COMPILING
            submission.detailed_feedback = "Compiling..."
            submission.save()

        temp_dir_obj = tempfile.TemporaryDirectory(prefix=f"submission_{submission_id}_")
        submission_dir = pathlib.Path(temp_dir_obj.name)
        
        compile_success, compiler_output, executable_path_str = compile_code_in_sandbox(
            submission.code, 
            submission.language, 
            submission_dir,
            problem.custom_libraries_allowed
        )
        
        # Update submission status after compilation attempt
        with transaction.atomic():
            submission = Submission.objects.select_for_update().get(id=submission_id) 
            if not compile_success:
                submission.verdict = Submission.VerdictStatus.COMPILE_ERROR
                submission.detailed_feedback = compiler_output
                submission.save()
                if temp_dir_obj: temp_dir_obj.cleanup()
                return f"Submission {submission_id}: Compile Error."
            
            submission.verdict = Submission.VerdictStatus.RUNNING
            submission.detailed_feedback = f"Compilation successful. Running test cases...\nCompiler Output:\n{compiler_output}"
            submission.save()
            
        overall_verdict = Submission.VerdictStatus.ACCEPTED
        total_score = 0
        max_time_ms_overall = 0
        max_memory_kb_overall = 0
        
        for i, tc in enumerate(test_cases):
            if executable_path_str is None: 
                overall_verdict = Submission.VerdictStatus.INTERNAL_ERROR
                SubmissionTestResult.objects.create(
                    submission=submission,
                    test_case=tc,
                    verdict=Submission.VerdictStatus.INTERNAL_ERROR,
                    error_output="Internal Error - Executable path missing after successful compile."
                )
                break 
            
            tc_verdict, tc_time, tc_mem, tc_output, tc_error = run_code_in_sandbox(
                executable_path_str, 
                submission.language, 
                tc.input_data, 
                problem.default_time_limit_ms, 
                problem.default_memory_limit_kb,
                submission_dir, 
                submission.code,
                problem.custom_libraries_allowed # Pass custom libraries here as well
            )
            
            max_time_ms_overall = max(max_time_ms_overall, tc_time if tc_time is not None else 0)
            max_memory_kb_overall = max(max_memory_kb_overall, tc_mem if tc_mem is not None else 0)
            
            final_tc_verdict = tc_verdict
            if tc_verdict == Submission.VerdictStatus.ACCEPTED: 
                if problem.comparison_mode == Problem.ComparisonMode.CUSTOM_CHECKER:
                    if problem.checker_code and problem.checker_language:
                        checker_temp_dir_obj_tc = tempfile.TemporaryDirectory(prefix=f"checker_{submission_id}_tc_{tc.id}_")
                        checker_dir_tc = pathlib.Path(checker_temp_dir_obj_tc.name)
                        input_file, user_output_file, answer_file = checker_dir_tc/"input.txt", checker_dir_tc/"user_output.txt", checker_dir_tc/"answer.txt"
                        with open(input_file, "w") as f: f.write(tc.input_data)
                        with open(user_output_file, "w") as f: f.write(tc_output)
                        with open(answer_file, "w") as f: f.write(tc.expected_output_data)
                        
                        checker_verdict_from_custom, checker_msg = run_custom_checker(
                            problem.checker_code, problem.checker_language,
                            input_file, user_output_file, answer_file, checker_dir_tc
                        )
                        final_tc_verdict = checker_verdict_from_custom
                        tc_error = (tc_error + "\n" if tc_error else "") + f"Custom Checker Feedback:\n{checker_msg}"
                        checker_temp_dir_obj_tc.cleanup() 
                    else:
                        final_tc_verdict = Submission.VerdictStatus.INTERNAL_ERROR
                        tc_error = (tc_error + "\n" if tc_error else "") + "Error: Custom checker selected but no checker code/lang."
                else: 
                    outputs_match = compare_outputs(tc_output, tc.expected_output_data, problem.comparison_mode, problem.float_comparison_epsilon)
                    if not outputs_match:
                        final_tc_verdict = Submission.VerdictStatus.WRONG_ANSWER
            
            SubmissionTestResult.objects.create(
                submission=submission,
                test_case=tc,
                verdict=final_tc_verdict,
                execution_time_ms=tc_time if tc_time != -1 else None, 
                memory_used_kb=tc_mem if tc_mem != -1 else None,     
                actual_output=tc_output[:10000], 
                error_output=tc_error[:10000]    
            )

            if final_tc_verdict == Submission.VerdictStatus.ACCEPTED:
                total_score += tc.points
            else:
                if overall_verdict == Submission.VerdictStatus.ACCEPTED: 
                    overall_verdict = final_tc_verdict 
        
        with transaction.atomic():
            submission = Submission.objects.select_for_update().get(id=submission_id) 
            submission.verdict = overall_verdict
            submission.score = total_score
            submission.execution_time_ms = max_time_ms_overall
            submission.memory_used_kb = max_memory_kb_overall
            submission.detailed_feedback = f"Overall Verdict: {overall_verdict.label}. Score: {total_score}."
            if compiler_output: 
                 submission.detailed_feedback = f"Compiler Output:\n{compiler_output}\n\n{submission.detailed_feedback}"
            submission.save()
            
        final_message = f"Submission {submission_id} judged. Verdict: {overall_verdict}"
    
    except Submission.DoesNotExist: 
        final_message = f"Submission {submission_id} not found."
    except Exception as e:
        final_message = f"Judge internal error for sub {submission_id}."
        print(f"Critical error judging {submission_id}: {e}")
        try:
            with transaction.atomic(): 
                submission_obj = Submission.objects.select_for_update().get(id=submission_id)
                submission_obj.verdict = Submission.VerdictStatus.INTERNAL_ERROR
                submission_obj.detailed_feedback = f"Judge system internal error: {str(e)}"
                submission_obj.save()
        except Exception as final_e: 
            print(f"Failed to update sub {submission_id} to INTERNAL_ERROR: {final_e}")
    finally:
        if temp_dir_obj: 
            temp_dir_obj.cleanup()
    return final_message
