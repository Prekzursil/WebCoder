import pathlib
import subprocess
from django.conf import settings # Import Django settings

# CONTAINER_BOOST_INCLUDE_PATH is still relevant as the target path inside Docker
CONTAINER_BOOST_INCLUDE_PATH = "/usr/local/include/boost_custom"

def compile_code_in_sandbox(
    source_code: str, 
    language: str, 
    submission_dir: pathlib.Path,
    custom_libraries_allowed: list[str] | None = None
):
    """
    Compiles code in a sandboxed environment using Docker.
    Returns: (compile_success: bool, compiler_output: str, executable_path: str | None)
    """
    print(f"Attempting to compile code for language: {language} in dir {submission_dir}...")
    abs_submission_dir = str(submission_dir.resolve())
    if custom_libraries_allowed is None:
        custom_libraries_allowed = []

    if language == "python3":
        source_file = submission_dir / "user_code.py"
        with open(source_file, "w") as f:
            f.write(source_code)
        return True, "Python code - written to file, no compilation needed.", str(source_file)
    
    elif language == "cpp17":
        source_file = submission_dir / "user_code.cpp"
        executable_file_in_container = "user_program" 
        executable_file_on_host = submission_dir / executable_file_in_container

        with open(source_file, "w") as f:
            f.write(source_code)
        
        docker_image = "gcc:latest"
        
        volume_mounts = [
            "-v", f"{abs_submission_dir}:/app",
        ]
        gpp_command = ["g++", "user_code.cpp", "-o", executable_file_in_container, "-std=c++17", "-O2"]

        if "boost_headers" in custom_libraries_allowed:
            host_boost_path = settings.JUDGE_BOOST_HEADERS_PATH
            if host_boost_path and pathlib.Path(host_boost_path).exists(): # Check if path is configured and exists
                print(f"Boost headers requested. Mounting from {host_boost_path}")
                volume_mounts.extend(["-v", f"{host_boost_path}:{CONTAINER_BOOST_INCLUDE_PATH}:ro"])
                gpp_command.insert(1, f"-I{CONTAINER_BOOST_INCLUDE_PATH}")
            elif host_boost_path:
                 print(f"Warning: Boost headers requested, but configured path '{host_boost_path}' does not exist on the host. Compilation may fail if Boost is used.")
            else:
                print("Warning: Boost headers requested, but JUDGE_BOOST_HEADERS_PATH is not configured in settings. Compilation may fail if Boost is used.")


        compile_command_list = [
            "docker", "run", "--rm",
            "--user", "1000:1000", "--cap-drop=ALL", "--security-opt=no-new-privileges",
            *volume_mounts, 
            "-w", "/app", "--network", "none",
            docker_image,
            *gpp_command 
        ]
        print(f"Executing C++ compile command: {' '.join(compile_command_list)}")
        try:
            result = subprocess.run(compile_command_list, capture_output=True, text=True, timeout=30) 
            compiler_output = f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
            if result.returncode == 0 and executable_file_on_host.exists():
                return True, f"C++ Compilation successful.\n{compiler_output}", str(executable_file_on_host)
            else:
                return False, f"C++ Compilation failed (return code {result.returncode}).\n{compiler_output}", None
        except subprocess.TimeoutExpired:
            return False, "C++ Compilation timed out (>30s).", None
        except FileNotFoundError:
            return False, "Docker command not found for C++ compilation.", None
        except Exception as e:
            return False, f"C++ Compilation system error: {str(e)}", None

    elif language == "java11":
        source_file_name = "Main.java"
        source_file_path = submission_dir / source_file_name
        with open(source_file_path, "w") as f:
            f.write(source_code)
        docker_image = "openjdk:11-jdk-slim"
        compile_command_list = [
            "docker", "run", "--rm",
            "--user", "1000:1000", "--cap-drop=ALL", "--security-opt=no-new-privileges",
            "-v", f"{abs_submission_dir}:/app", "-w", "/app", "--network", "none",
            docker_image,
            "javac", source_file_name
        ]
        print(f"Executing Java compile command: {' '.join(compile_command_list)}")
        try:
            result = subprocess.run(compile_command_list, capture_output=True, text=True, timeout=30)
            compiler_output = f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
            class_file_on_host = submission_dir / "Main.class"
            if result.returncode == 0 and class_file_on_host.exists():
                return True, f"Java Compilation successful.\n{compiler_output}", str(submission_dir) 
            else:
                return False, f"Java Compilation failed (return code {result.returncode}).\n{compiler_output}", None
        except subprocess.TimeoutExpired:
            return False, "Java Compilation timed out (>30s).", None
        except FileNotFoundError:
            return False, "Docker command not found for Java compilation.", None
        except Exception as e:
            return False, f"Java Compilation system error: {str(e)}", None

    return False, f"Unsupported language for compilation: {language}", None
