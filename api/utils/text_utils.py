"""Text normalization utilities for OCR and document processing - General Technical Version"""
import re
import base64

def normalize_spaced_text(text: str) -> str:
    """
    Algemene normalisatie voor technische schema's. 
    Herstelt verspreide karakters terwijl de algemene structuur behouden blijft.
    """
    if not text:
        return ""

    text = text.replace("\r", "")

    def collapse_spaced_sequences(line: str) -> str:
        # Pakt woorden als "S t a r t" of "V l e e s" (minimaal 3 karakters)
        pattern = r'(?<!\w)(?:[A-Za-z0-9]\s+){2,}[A-Za-z0-9](?!\w)'
        return re.sub(pattern, lambda m: m.group(0).replace(" ", ""), line)

    fixed_lines = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        # --- 1. DATUMS EN CODES (Prioriteit) ---
        
        # Herstel datums zoals "2 5 - 0 6 - 2 0 2 0" of "2 5-0 6-2020"
        line = re.sub(r"(\d)\s+(\d)\s*-\s*(\d)\s+(\d)\s*-\s*(\d{4})", r"\1\2-\3\4-\5", line)
        line = re.sub(r"(\d)\s+(\d)-(\d)\s+(\d)-(\d{4})", r"\1\2-\3\4-\5", line)

        # Herstel Module-ID's/Artikelnummers met een spatie voor het laatste cijfer
        # Voorbeeld: -2IM0202DO-1 7 -> -2IM0202DO-17 of 6ES7.../D O 8 -> /DO8
        line = re.sub(r'([A-Z0-9-]{3,}\d)\s+(\d)\b', r'\1\2', line)
        line = re.sub(r"/([A-Z])\s+([A-Z])\s+(\d+)", r"/\1\2\3", line, flags=re.IGNORECASE)

        # --- 2. ALGEMENE WOORDEN EN AFKORTINGEN ---
        
        line = collapse_spaced_sequences(line)
        
        # Technische termen
        line = re.sub(r"\bN\s+O\b", "NO", line, flags=re.IGNORECASE)
        line = re.sub(r"\bN\s+C\b", "NC", line, flags=re.IGNORECASE)
        line = re.sub(r"\bA\s+([12])\b", r"A\1", line)

        # --- 3. NUMERIEKE REPARATIES (Objecten en Adressen) ---

        # Belangrijk: Herstel cijfers die uit elkaar zijn gevallen (bijv. 6 1 5 -> 615)
        # We kijken nu naar 2 of meer losse cijfers
        line = re.sub(r"\b(\d)\s+(\d)(?:\s+(\d))*\b",
                      lambda m: m.group(0).replace(" ", ""), line)

        # Herstel adressen met punten (601 . 9 -> 601.9 of Q 264 . 1 -> Q264.1)
        line = re.sub(r'(\d+)\s*\.\s*(\d+)', r'\1.\2', line)
        line = re.sub(r'([QI])\s*(\d+)', r'\1\2', line, flags=re.IGNORECASE)

        # --- 4. FINALE OPSCHONING ---
        
        # Haal spaties weg rondom technische tekens in codes
        line = re.sub(r'([A-Z0-9])\s*([/\-_])\s*([A-Z0-9])', r'\1\2\3', line, flags=re.IGNORECASE)
        
        # Normaliseer witruimte
        line = re.sub(r"\s+", " ", line).strip()

        fixed_lines.append(line)

    return "\n".join(fixed_lines).strip()

def encode_file_to_base64(file_path: str) -> str:
    try:
        with open(file_path, "rb") as file:
            return base64.b64encode(file.read()).decode('utf-8')
    except Exception as e:
        raise Exception(f"Failed to encode file to base64: {str(e)}")