"""Post-processing: deterministic rules applied to AssemblyAI's output before Human review.

Each rule is a plain function text -> text, run in order on every utterance's text.
To add a rule, write the function and append it to RULES. Only the editable transcript
(jobs.utterances) is post-processed; jobs.original_utterances keeps the raw AI output.
"""
import re

_WORD = r"[\w']+"


def em_dashes_to_double_hyphens(text: str) -> str:
    """AssemblyAI marks false starts and cut-offs with an em dash ("Monday— Friday",
    "or just—"); court style writes these as a spaced double hyphen."""
    return re.sub(r"\s*(?:—|--)\s*", " -- ", text).rstrip()


# Single words that are repeated for emphasis or as conversational acknowledgment,
# where court style keeps the comma ("very, very dark", "No, no", "Okay, okay").
EMPHASIS_WORDS = {
    "no", "yes", "yeah", "yep", "nope", "okay", "ok", "right", "sure", "well", "roger",
    "very", "really", "so", "much", "many", "more", "far", "long", "fast", "slow",
    "highly", "over", "again", "never", "ever", "too", "please", "sorry", "bye",
    "hey", "wait", "stop", "go", "come", "hurry", "quick", "quickly", "big", "little",
}

# Pronouns that often end one clause and start the next ("Once we had seen it, it seemed",
# "thank you, you guys"). Repeated across a comma, they only count as a restart when they
# open the fragment or follow a filler/conjunction ("And it, it was", "Um, that, that door").
CLAUSE_EDGE_WORDS = {"it", "you", "him", "her", "them", "me", "us", "that", "this", "there", "here"}
RESTART_LEADERS = {"and", "but", "so", "or", "because", "cause", "if", "when", "then", "um", "uh",
                   "like", "well", "now", "yeah", "okay", "oh"}

# Words that are never correctly doubled, so a bare repeat ("I I locked", "to to fix")
# is always a stumble. Deliberately short: "that that" and "had had" are valid English.
_BARE_REPEAT_WORDS = r"i|the|a|an|and|to|but|my"


def _is_restart(before: str, after: str) -> bool:
    """True if the words right after a comma repeat the words right before it: an exact
    repeat ("the, the") or a restart that picks up the same words ("where, where it")."""
    segment = re.split(r"[.?!;:,]| -- ", before)[-1]
    bw = re.findall(_WORD, segment)[-4:]
    aw = re.findall(_WORD, after)[:4]
    for k in range(min(len(bw), len(aw)), 0, -1):
        unit = [w.lower() for w in bw[-k:]]
        if unit != [w.lower() for w in aw[:k]]:
            continue
        if k == 1:
            word = unit[0]
            if word in EMPHASIS_WORDS:
                return False
            # Spelled-out letters and read-out digits ("D, O, L, L"); "I" and "a" are real words
            if (len(word) == 1 and word not in ("i", "a")) or word.isdigit():
                return False
            # A name called out ("Karina, Karina"), not a stumble
            if word != "i" and bw[-1][0].isupper() and aw[0][0].isupper():
                return False
            if word in CLAUSE_EDGE_WORDS and len(bw) > 1 and bw[-2].lower() not in RESTART_LEADERS:
                return False
        return True
    return False


def repeats_to_double_hyphens(text: str) -> str:
    """Speaker repetitions are separated by double hyphens, not commas:
    "I, I, I don't know where, where it, where it was" ->
    "I -- I -- I don't know where -- where it -- where it was"."""
    parts = re.split(r"(, )", text)
    out = parts[0]
    for i in range(1, len(parts), 2):
        after = parts[i + 1]
        out += (" -- " if _is_restart(out, after) else ", ") + after
    return re.sub(rf"\b({_BARE_REPEAT_WORDS}) (?=\1\b)", r"\1 -- ", out, flags=re.I)


_SMALL_NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]

# Words after which a number is a label or reference and stays a numeral, along with
# the rest of its list ("Exhibits 7, 8, and 9", "paragraph 3", "April 7").
NUMERAL_LABELS = {
    "exhibit", "exhibits", "no", "number", "numbers", "paragraph", "paragraphs", "subparagraph",
    "section", "sections", "count", "counts", "page", "pages", "line", "lines", "rule", "chapter",
    "article", "amendment", "measure", "item", "question", "case", "room", "apartment", "unit",
    "suite", "building", "floor", "lot", "channel", "highway", "interstate", "route", "station",
    "engine", "medic", "version", "grade", "level", "step", "table", "figure", "appendix", "volume",
    "part", "parts", "phase", "day", "camera",
    "january", "february", "march", "april", "may", "june", "july", "august", "september",
    "october", "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep",
    "sept", "oct", "nov", "dec",
}
_NUM_LIST_LINK = r"(?:,\s*(?:and\s+|or\s+)?|\s+(?:and|or|to|through)\s+|\s*-\s*)"
_NUM_LIST = rf"\d+(?:{_NUM_LIST_LINK}\d+)*"
_LABELED_NUMBERS = re.compile(rf"\b(?:{'|'.join(NUMERAL_LABELS)})\.?\s+#?{_NUM_LIST}", re.I)
_AM_PM = r"\s*[ap]\.?m\b"
_SMALL_NUMBER = re.compile(r"(?<![\w.,:$#/-])(10|\d)(?![\w%]|[.,:/-]\d)")


def small_numbers_to_words(text: str) -> str:
    """Numbers zero through ten are written as words ("3 years" -> "three years");
    larger numbers stay numerals. Labels and references (exhibits, dates, paragraphs),
    times ("6 PM", "4:40"), money, decimals, and ranges that run past ten ("10 to 15
    minutes") keep their numerals."""
    protected = [m.span() for m in _LABELED_NUMBERS.finditer(text)]
    protected += [m.span() for m in re.finditer(_NUM_LIST, text)
                  if any(int(n) > 10 for n in re.findall(r"\d+", m.group(0)))
                  or re.match(_AM_PM, text[m.end():], re.I)]

    def to_word(m):
        if any(s <= m.start() < e for s, e in protected):
            return m.group(0)
        word = _SMALL_NUMBER_WORDS[int(m.group(1))]
        sentence_start = re.search(r"(^|[.?!]\s+)$", text[:m.start()])
        return word.capitalize() if sentence_start else word

    return _SMALL_NUMBER.sub(to_word, text)


RULES = [
    em_dashes_to_double_hyphens,
    repeats_to_double_hyphens,
    small_numbers_to_words,  # after repeats: digits are exempt from repeat-dashing ("2, 2"), words aren't
]


def postprocess_text(text: str) -> str:
    for rule in RULES:
        text = rule(text)
    return text


def postprocess_blocks(blocks: list) -> list:
    return [
        {**b, "text": postprocess_text(b["text"])} if b.get("type", "utterance") == "utterance" else b
        for b in blocks
    ]
