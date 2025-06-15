import pathlib # Not strictly needed by this function but good for consistency if other utils use it
from problems.models import Problem # For Problem.ComparisonMode

def compare_outputs(
    generated_output: str, 
    expected_output: str, 
    comparison_mode: str, 
    float_epsilon: float | None = 1e-6
) -> bool:
    """
    Compares the generated output with the expected output based on the comparison mode.
    """
    if comparison_mode == Problem.ComparisonMode.EXACT:
        return generated_output == expected_output
    elif comparison_mode == Problem.ComparisonMode.STRIP_EXACT:
        return generated_output.strip() == expected_output.strip()
    elif comparison_mode == Problem.ComparisonMode.LINES_STRIP_EXACT:
        gen_lines = [line.strip() for line in generated_output.replace('\r\n', '\n').split('\n')]
        exp_lines = [line.strip() for line in expected_output.replace('\r\n', '\n').split('\n')]
        while gen_lines and gen_lines[-1] == "": gen_lines.pop()
        while exp_lines and exp_lines[-1] == "": exp_lines.pop()
        return gen_lines == exp_lines
    elif comparison_mode == Problem.ComparisonMode.FLOAT_PRECISE:
        if float_epsilon is None: 
            float_epsilon = 1e-6
        try:
            gen_lines = [line.strip() for line in generated_output.replace('\r\n', '\n').split('\n')]
            exp_lines = [line.strip() for line in expected_output.replace('\r\n', '\n').split('\n')]
            while gen_lines and gen_lines[-1] == "": gen_lines.pop()
            while exp_lines and exp_lines[-1] == "": exp_lines.pop()

            if len(gen_lines) != len(exp_lines):
                return False

            for gen_line, exp_line in zip(gen_lines, exp_lines):
                gen_tokens = gen_line.split()
                exp_tokens = exp_line.split()
                if len(gen_tokens) != len(exp_tokens):
                    return False
                for gen_token, exp_token in zip(gen_tokens, exp_tokens):
                    try:
                        gen_float = float(gen_token)
                        exp_float = float(exp_token)
                        if not (abs(gen_float - exp_float) <= float_epsilon * max(1.0, abs(exp_float), abs(gen_float))):
                            return False
                    except ValueError:
                        if gen_token != exp_token:
                            return False 
            return True
        except Exception as e:
            print(f"Error during FLOAT_PRECISE comparison: {e}")
            return False
    
    print(f"Warning: Unknown or unhandled comparison mode '{comparison_mode}'. Defaulting to 'LINES_STRIP_EXACT'.")
    gen_lines = [line.strip() for line in generated_output.replace('\r\n', '\n').split('\n')]
    exp_lines = [line.strip() for line in expected_output.replace('\r\n', '\n').split('\n')]
    while gen_lines and gen_lines[-1] == "": gen_lines.pop()
    while exp_lines and exp_lines[-1] == "": exp_lines.pop()
    return gen_lines == exp_lines
