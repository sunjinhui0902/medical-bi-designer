"""Read-only structural summary of FineVis .fvs archives for local planning."""
import collections
import json
import re
import sys
import zipfile
from pathlib import Path


def clean(value):
    if not isinstance(value, str):
        return ""
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:160] if re.search(r"[\u4e00-\u9fff]", value) else ""


def summarize(file):
    with zipfile.ZipFile(file) as archive:
        store = json.loads(archive.read("store.json"))
        widgets = [widget for story in store.get("stories", []) for widget in story.get("widgets", [])]
        records = []
        for widget in widgets:
            state = widget.get("states") or {}
            props = widget.get("props") or {}
            texts = [clean(props.get(key)) for key in ("value", "values", "title", "text")]
            records.append({
                "type": widget.get("type"),
                "text": next((text for text in texts if text), ""),
                "x": (state.get("matrix") or [0, 0, 0, 0, state.get("left", 0)])[4],
                "y": (state.get("matrix") or [0, 0, 0, 0, 0, state.get("top", 0)])[5] if len(state.get("matrix") or []) > 5 else state.get("top", 0),
                "width": state.get("width"),
                "height": state.get("height"),
                "actions": len(widget.get("actions") or []),
                "events": [event.get("type") for event in widget.get("events") or []],
            })
        template = archive.read("editor.tpl").decode("utf-8", "replace")
        fields = sorted(set(re.findall(r"(?:ads|dws|dwd)\.[a-zA-Z_][a-zA-Z_0-9]*", template, re.I)))
        return {
            "file": str(file), "canvas": [store.get("width"), store.get("height")],
            "adaptiveMode": store.get("adaptiveMode"), "pages": len(store.get("stories", [])),
            "widgetTypes": dict(collections.Counter(record["type"] for record in records)),
            "widgets": records, "tableReferences": fields,
        }


if __name__ == "__main__":
    print(json.dumps([summarize(Path(name)) for name in sys.argv[1:]], ensure_ascii=False, indent=2))
