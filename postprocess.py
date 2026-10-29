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


RULES = [
    em_dashes_to_double_hyphens,
    repeats_to_double_hyphens,
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
