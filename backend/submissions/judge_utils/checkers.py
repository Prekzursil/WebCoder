import pathlib
import subprocess
from ..models import Submission # For Submission.VerdictStatus

def run_custom_checker(
    checker_code: str, 
    checker_language: str,
    input_file_path: pathlib.Path,
    user_output_file_path: pathlib.Path,
    answer_file_path: pathlib.Path,
    checker_submission_dir: pathlib.Path
) -> tuple[Submission.VerdictStatus, str]:
    print(f"Running custom checker ({checker_language}) in {checker_submission_dir}")
    checker_executable_path_str: str | None = None
    compile_ok = False
    compiler_out = ""
    docker_image_checker_run: str = "" 
    checker_run_command_args: list[str] = [] 

    if checker_language == "python3":
        checker_script_file = checker_submission_dir / "checker.py"
        with open(checker_script_file, "w") as f: f.write(checker_code)
        checker_executable_path_str, compile_ok, compiler_out = str(checker_script_file), True, "Checker is Python."
        docker_image_checker_run, checker_run_command_args = "python:3.11-slim", ["python", "/app/checker.py"]
    elif checker_language == "cpp17":
        source_file = checker_submission_dir / "checker.cpp"
        executable_file_in_container, executable_file_on_host = "checker_program", checker_submission_dir / "checker_program"
        with open(source_file, "w") as f: f.write(checker_code)
        docker_image_checker_compile = "gcc:latest"
        abs_checker_dir = str(checker_submission_dir.resolve())
        checker_compile_cmd = [
            "docker", "run", "--rm", "--user", "1000:1000", "--cap-drop=ALL", 
            "--security-opt=no-new-privileges", "-v", f"{abs_checker_dir}:/app",
            "-w", "/app", "--network", "none", docker_image_checker_compile,
            "g++", "checker.cpp", "-o", executable_file_in_container, "-std=c++17", "-O2"
        ]
        try:
            result = subprocess.run(checker_compile_cmd, capture_output=True, text=True, timeout=30)
            compiler_out = f"Checker Compile STDOUT:\n{result.stdout}\nChecker Compile STDERR:\n{result.stderr}"
            if result.returncode == 0 and executable_file_on_host.exists():
                compile_ok, checker_executable_path_str = True, str(executable_file_on_host)
            # else: compile_ok remains False, compiler_out has details
        except Exception as e: 
            compiler_out = f"Checker compile error: {str(e)}"
            compile_ok = False # Ensure it's false on exception
        # These assignments happen regardless of compile success for C++, ensure compile_ok is the gate
        if compile_ok:
            docker_image_checker_run, checker_run_command_args = "gcc:latest", ["/app/checker_program"]
        else: # If C++ compile failed, don't set run command details
            docker_image_checker_run, checker_run_command_args = "", []

    else: return Submission.VerdictStatus.INTERNAL_ERROR, f"Unsupported checker language: {checker_language}"

    if not compile_ok: return Submission.VerdictStatus.INTERNAL_ERROR, f"Checker compile failed.\n{compiler_out}"
    # Check if essential run configurations were set (they should be if compile_ok is true for supported languages)
    if not checker_executable_path_str or not docker_image_checker_run or not checker_run_command_args:
         return Submission.VerdictStatus.INTERNAL_ERROR, "Checker config error after compile (executable, image, or run_args missing)."

    container_input_path = "/app/" + input_file_path.name 
    container_user_out_path = "/app/" + user_output_file_path.name
    container_ans_path = "/app/" + answer_file_path.name
    
    # checker_run_command_args should already contain the program to run (e.g. ["python", "/app/checker.py"])
    # Now extend it with the file paths
    current_checker_run_command_args = list(checker_run_command_args) # Make a copy to avoid modifying the template
    current_checker_run_command_args.extend([container_input_path, container_user_out_path, container_ans_path])
    
    checker_time_limit_s, checker_mem_limit_kb = 10, 262144 
    time_format_string_checker = "%U %S %M %x %P %e"
    
    command_to_time_checker = ["/usr/bin/time", "-f", time_format_string_checker] + current_checker_run_command_args
    command_for_docker_checker = ["timeout", "--signal=SIGKILL", f"{checker_time_limit_s + 1:.2f}s"] + command_to_time_checker
    
    base_docker_command_args_checker = [
        "docker", "run", "--rm", "-i", "--user", "1000:1000", "--cap-drop=ALL",
        "--security-opt=no-new-privileges", "--memory", f"{checker_mem_limit_kb}k",
        "--memory-swap", f"{checker_mem_limit_kb}k", "--network", "none",
        "-v", f"{str(checker_submission_dir.resolve())}:/app:ro", "-w", "/app",
        docker_image_checker_run, # This must be defined if compile_ok was true
    ]
    full_checker_run_cmd = base_docker_command_args_checker + command_for_docker_checker
    
    print(f"Executing Custom Checker: {' '.join(full_checker_run_cmd)}")
    checker_stdout, checker_stderr = "", ""
    try:
        checker_process = subprocess.Popen(full_checker_run_cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        checker_stdout, checker_stderr = checker_process.communicate(timeout=checker_time_limit_s + 3)
        checker_resource_msg = ""
        if checker_stderr:
            lines = checker_stderr.strip().splitlines()
            if lines:
                for i_line in range(len(lines) -1, -1, -1):
                    parts = lines[i_line].split()
                    if len(parts) >= 6 and parts[4].endswith('%'): 
                        checker_resource_msg = f"\nChecker Resources: {lines[i_line]}"; break
        feedback = f"Checker STDOUT:\n{checker_stdout}\nChecker STDERR:\n{checker_stderr}{checker_resource_msg}"
        if checker_process.returncode == 124: return Submission.VerdictStatus.INTERNAL_ERROR, f"Checker timed out.\n{feedback}"
        exit_code = checker_process.returncode
        if exit_code == 0: return Submission.VerdictStatus.ACCEPTED, feedback
        # For checkers, non-zero often means WA, but could be PE or other custom codes.
        # Defaulting to WA for simplicity here.
        return Submission.VerdictStatus.WRONG_ANSWER, f"Checker indicated failure (code {exit_code}).\n{feedback}"
    except subprocess.TimeoutExpired: return Submission.VerdictStatus.INTERNAL_ERROR, "Checker communication timeout."
    except FileNotFoundError: return Submission.VerdictStatus.INTERNAL_ERROR, "Docker/checker cmd not found."
    except Exception as e: return Submission.VerdictStatus.INTERNAL_ERROR, f"Checker run error: {str(e)}\nSTDOUT: {checker_stdout}\nSTDERR: {checker_stderr}"
