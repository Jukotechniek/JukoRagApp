"""Text normalization utilities for OCR and document processing"""
import re


def normalize_spaced_text(text: str) -> str:
    """Normalize text with spaced characters (e.g., "W e s t f o r t" -> "Westfort")
    
    Handles various OCR artifacts and spacing issues in technical documents.
    """
    if not text:
        return ""

    text = text.replace("\r", "")

    def collapse_spaced_sequences(line: str) -> str:
        pattern = r'(?<!\w)(?:[A-Za-z0-9]\s+){3,}[A-Za-z0-9](?!\w)'
        return re.sub(pattern, lambda m: m.group(0).replace(" ", ""), line)

    fixed_lines = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        # 1) collapse S t a r t / 8 8 4 1 Q 2 / 0 V D C
        line = collapse_spaced_sequences(line)

        # 2) join "A 1" -> "A1", "A 2" -> "A2"
        line = re.sub(r"\bA\s+([12])\b", r"A\1", line)

        # 3) join split numbers like "6 1 5" -> "615" (only if it's a sequence of single digits)
        #    examples: "6 0 1.9" should become "601.9" (we handle dot below too)
        line = re.sub(r"\b(\d)\s+(\d)(?:\s+(\d))+\b",
                      lambda m: m.group(0).replace(" ", ""), line)

        # 4) join digit + unit: "1 7 A" -> "17A", "9 A" -> "9A"
        line = re.sub(r"\b(\d)\s+(\d)\s*([A-Za-z])\b", r"\1\2\3", line)  # 1 7 A
        line = re.sub(r"\b(\d)\s+([A-Za-z])\b", r"\1\2", line)          # 9 A

        # 5) fix split "DO 8" -> "DO8", "NO NC" keep spacing (don't join those)
        line = re.sub(r"\bDO\s+(\d)\b", r"DO\1", line, flags=re.IGNORECASE)

        # 6) normalize dots in addresses: "6 0 1.9" -> "601.9", "3 0 1.1" -> "301.1"
        line = re.sub(r"\b(\d)\s+(\d)\s+(\d)\.(\d)\b", r"\1\2\3.\4", line)  # 6 0 1.9
        line = re.sub(r"\b(\d)\s+(\d)\.(\d)\b", r"\1\2.\3", line)          # safety

        # 7) fix PLC address formatting: Q264 .1 -> Q264.1, and stop Q264.12 becoming one token
        line = re.sub(r'\b([QI]\d+)\s*\.\s*(\d)\b', r'\1.\2', line, flags=re.IGNORECASE)
        line = re.sub(r'\b([QI]\d+)\.(\d)(\d+)\b', r'\1.\2 \3', line, flags=re.IGNORECASE)

        # 8) fix dates like "2 5-0 6-2020" -> "25-06-2020"
        line = re.sub(r"\b(\d)\s+(\d)-(\d)\s+(\d)-(\d{4})\b", r"\1\2-\3\4-\5", line)

        # 9) remove spaces around punctuation a bit (keep slashes and dashes tight)
        line = re.sub(r"\s*([.:,;/\-_()=+])\s*", r"\1", line)

        # 10) optional: split CamelCase words (letters only)
        line = re.sub(r'(?<=[a-z])(?=[A-Z][a-z])', ' ', line)

        # 11) normalize whitespace
        line = re.sub(r"[ \t]+", " ", line).strip()

        fixed_lines.append(line)

    return "\n".join(fixed_lines).strip()


def encode_file_to_base64(file_path: str) -> str:
    """Encode a file to base64 string for Mistral OCR API.
    
    Args:
        file_path: Path to the file to encode
        
    Returns:
        Base64 encoded string of the file content
    """
    import base64
    try:
        with open(file_path, "rb") as file:
            file_data = file.read()
            return base64.b64encode(file_data).decode('utf-8')
    except Exception as e:
        raise Exception(f"Failed to encode file to base64: {str(e)}")

