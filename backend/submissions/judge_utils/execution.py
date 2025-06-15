import pathlib
import subprocess
import random 
from django.conf import settings # Import Django settings
from ..models import Submission 

# Define a placeholder path for Java external libraries on the container.
# This is where the JUDGE_JAVA_LIBS_DIR_HOST will be mounted.
CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH = "/app/host_java_libs"

def run_code_in_sandbox(
    executable_path_str: str, 
    language: str, 
    input_data: str, 
    time_limit_ms: int, 
    memory_limit_kb: int, 
    submission_dir: pathlib.Path, 
    source_code: str, 
    custom_libraries_allowed: list[str] | None = None
):
    """
    Runs code in a sandboxed environment using Docker.
    Returns: (verdict: VerdictStatus, execution_time_ms: int, memory_used_kb: int, output_data: str, error_output: str)
    """
    
    print(f"Attempting to run for language {language} with input: {input_data[:30]}...")
    if custom_libraries_allowed is None:
        custom_libraries_allowed = []
        
    final_verdict = Submission.VerdictStatus.INTERNAL_ERROR
    final_time_ms = -1
    final_mem_kb = -1
    final_output = ""
    final_error = "Judge execution did not complete as expected."

    time_limit_s = (time_limit_ms / 1000.0) if time_limit_ms > 0 else 1 
    time_format_string = "%U %S %M %x %P %e" 
    
    docker_image = ""
    program_and_args_in_container: list[str] = []
    abs_mount_path = str(submission_dir.resolve())
    mount_mode = "ro" 
    network_mode = "--network" 
    network_value = "none"    
    additional_volume_mounts: list[str] = []


    if language == "python3":
        executable_path = pathlib.Path(executable_path_str) 
        docker_image = "python:3.11-slim" 
        script_to_run_in_container = "/app/" + executable_path.name
        python_execution_command = ["python", script_to_run_in_container]

        if custom_libraries_allowed:
            mount_mode = "rw" 
            network_value = "bridge" 
            print(f"Python custom libraries requested: {custom_libraries_allowed}. Network will be enabled for pip install.")
            requirements_file_path = submission_dir / "requirements_custom.txt"
            with open(requirements_file_path, "w") as f:
                for lib in custom_libraries_allowed:
                    f.write(f"{lib}\n")
            
            install_and_run_command = (
                f"if [ -f /app/requirements_custom.txt ]; then "
                f"echo 'Attempting to install custom Python libraries...' && "
                f"pip install --no-cache-dir -r /app/requirements_custom.txt --user && "
                f"echo 'Finished library installation attempt.'; "
                f"fi && python /app/{executable_path.name}"
            )
            program_and_args_in_container = ["sh", "-c", install_and_run_command]
        else:
            program_and_args_in_container = python_execution_command
            
    elif language == "cpp17":
        executable_path = pathlib.Path(executable_path_str) 
        docker_image = "gcc:latest" 
        program_to_run_in_container = "/app/" + executable_path.name
        program_and_args_in_container = [program_to_run_in_container]
            
    elif language == "java11":
        docker_image = "openjdk:11-jre-slim" 
        # executable_path_str is the directory containing Main.class
        abs_mount_path = str(pathlib.Path(executable_path_str).resolve()) # Mount the directory with .class files
        
        classpath_parts = ["/app"] # For Main.class in the submission directory

        if custom_libraries_allowed: 
            host_java_libs_dir_str = settings.JUDGE_JAVA_LIBS_DIR_HOST
            if host_java_libs_dir_str:
                host_java_libs_dir = pathlib.Path(host_java_libs_dir_str)
                if host_java_libs_dir.exists() and host_java_libs_dir.is_dir():
                    print(f"Java custom libraries requested. Mounting from {host_java_libs_dir} to {CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH}")
                    additional_volume_mounts.extend(["-v", f"{str(host_java_libs_dir.resolve())}:{CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH}:ro"])
                    
                    # Construct classpath with specified JARs
                    # Assumes identifiers in custom_libraries_allowed are exact JAR filenames
                    for jar_filename in custom_libraries_allowed:
                        # Basic check for potentially problematic filenames, though this is not exhaustive
                        if ".." in jar_filename or "/" in jar_filename or "\\" in jar_filename:
                            print(f"Warning: Skipping potentially unsafe JAR filename in custom_libraries_allowed: {jar_filename}")
                            continue
                        classpath_parts.append(f"{CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH}/{jar_filename}")
                elif not host_java_libs_dir.exists():
                    print(f"Warning: Java libraries requested, but JUDGE_JAVA_LIBS_DIR_HOST '{host_java_libs_dir_str}' does not exist.")
                else: # Exists but not a directory
                    print(f"Warning: Java libraries requested, but JUDGE_JAVA_LIBS_DIR_HOST '{host_java_libs_dir_str}' is not a directory.")
            else:
                print("Warning: Java libraries requested, but JUDGE_JAVA_LIBS_DIR_HOST is not configured in settings.")
        
        final_classpath = ":".join(classpath_parts)
        program_and_args_in_container = ["java", "-cp", final_classpath, "Main"]

    else:
        final_error = f"Unsupported language for execution: {language}"
        return final_verdict, final_time_ms, final_mem_kb, final_output, final_error

    command_to_time = ["/usr/bin/time", "-f", time_format_string] + program_and_args_in_container
    command_for_docker = ["timeout", "--signal=SIGKILL", f"{time_limit_s + 1:.2f}s"] + command_to_time
    
    base_docker_command_args = [
        "docker", "run", "--rm", "-i", 
        "--user", "1000:1000", "--cap-drop=ALL", "--security-opt=no-new-privileges",
        "--memory", f"{memory_limit_kb}k", "--memory-swap", f"{memory_limit_kb}k", 
        network_mode, network_value, 
        "-v", f"{abs_mount_path}:/app:{mount_mode}", 
        *additional_volume_mounts, 
        "-w", "/app", docker_image,
    ]
    run_command = base_docker_command_args + command_for_docker
        
    print(f"Executing Docker command for {language}: {' '.join(run_command)}")
    
    try:
        actual_time_ms = -1 
        actual_mem_kb = -1  
        stdout_data = ""
        stderr_data = ""
        parsed_stderr = ""
        process_timeout = time_limit_s + 10 if (language == "python3" and custom_libraries_allowed) else time_limit_s + 3

        process = subprocess.Popen(run_command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout_data, stderr_data = process.communicate(input=input_data, timeout=process_timeout) 
        
        time_output_parsed = False
        resource_usage_line = None
        program_actual_stderr_lines = []

        if stderr_data:
            lines = stderr_data.strip().splitlines()
            if lines:
                for i_line in range(len(lines) -1, -1, -1):
                    parts = lines[i_line].split()
                    if len(parts) >= 6 and parts[4].endswith('%'): 
                        resource_usage_line = lines[i_line]
                        program_actual_stderr_lines = lines[:i_line] 
                        break 
                if not resource_usage_line: 
                     program_actual_stderr_lines = lines 
        
        if language == "python3" and custom_libraries_allowed:
            program_actual_stderr_lines = [
                line for line in program_actual_stderr_lines 
                if not ("Collecting" in line or "Installing collected packages" in line or 
                        "Successfully installed" in line or "Requirement already satisfied" in line or
                        "Attempting to install custom Python libraries..." in line or "Finished library installation attempt." in line or
                        "WARNING: The script " in line and "is installed in" in line and "which is not on PATH." in line) 
            ]
        parsed_stderr = "\n".join(program_actual_stderr_lines).strip()

        if resource_usage_line:
            try:
                parts = resource_usage_line.split()
                user_cpu_s, sys_cpu_s = float(parts[0]), float(parts[1])
                actual_mem_kb, actual_time_ms = int(parts[2]), int((user_cpu_s + sys_cpu_s) * 1000)
                time_output_parsed = True
            except (ValueError, IndexError) as parse_err:
                print(f"Warning: Could not parse resource usage for {language}: '{resource_usage_line}'. Error: {parse_err}")
        
        final_output, final_error, final_time_ms, final_mem_kb = stdout_data, parsed_stderr, actual_time_ms, actual_mem_kb

        if process.returncode == 124: 
            final_verdict, final_error, final_time_ms = Submission.VerdictStatus.TIME_LIMIT_EXCEEDED, parsed_stderr + f"\nTimeout (>{time_limit_s}s).", time_limit_ms 
        elif time_output_parsed and actual_time_ms > time_limit_ms:
             final_verdict, final_error = Submission.VerdictStatus.TIME_LIMIT_EXCEEDED, parsed_stderr + f"\nCPU TLE ({actual_time_ms}ms > {time_limit_ms}ms)."
        elif process.returncode == 0: 
            final_verdict = Submission.VerdictStatus.ACCEPTED
        else: 
            final_verdict = Submission.VerdictStatus.RUNTIME_ERROR
            pip_error_keywords = ["ERROR: Could not find a version that satisfies the requirement", "ERROR: No matching distribution found for"]
            if language == "python3" and custom_libraries_allowed and any(kw in stderr_data for kw in pip_error_keywords):
                 final_error = f"Python Library Install Error:\n{stderr_data}\n\nProgram Stderr:\n{parsed_stderr}\nExit code: {process.returncode}."
            else:
                final_error = parsed_stderr + f"\nExit code: {process.returncode}."
            if not time_output_parsed and stderr_data and not (language == "python3" and custom_libraries_allowed and any(kw in stderr_data for kw in pip_error_keywords)):
                 final_error = stderr_data + f"\nExit code: {process.returncode}."

    except subprocess.TimeoutExpired: 
        final_verdict, final_error, final_time_ms, final_mem_kb = Submission.VerdictStatus.TIME_LIMIT_EXCEEDED, f"Communicate timeout after {process_timeout}s.", int(process_timeout * 1000), memory_limit_kb 
    except FileNotFoundError: 
        final_verdict, final_error = Submission.VerdictStatus.INTERNAL_ERROR, "Docker command not found."
    except Exception as e:
        final_verdict, final_error = Submission.VerdictStatus.INTERNAL_ERROR, f"Execution error for {language}: {str(e)}"
    
    if "tle_trigger" in input_data.lower() and final_verdict == Submission.VerdictStatus.ACCEPTED : 
        final_verdict, final_time_ms, final_output, final_error = Submission.VerdictStatus.TIME_LIMIT_EXCEEDED, time_limit_ms, "", "Simulated TLE by trigger"
    if "mle_trigger" in input_data.lower() and final_verdict == Submission.VerdictStatus.ACCEPTED:
        final_verdict, final_mem_kb, final_output, final_error = Submission.VerdictStatus.MEMORY_LIMIT_EXCEEDED, memory_limit_kb, "", "Simulated MLE by trigger"
    if "re_trigger" in source_code.lower() and final_verdict == Submission.VerdictStatus.ACCEPTED: 
        final_verdict, final_output, final_error = Submission.VerdictStatus.RUNTIME_ERROR, "", "Simulated RE by trigger"
        
    return final_verdict, final_time_ms, final_mem_kb, final_output, final_error
