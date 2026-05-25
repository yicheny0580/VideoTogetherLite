import json
import os
import sys
from pathlib import Path
from time import time


ROOT = Path(os.path.realpath(sys.argv[0])).parent.parent
SOURCE = ROOT / "source" / "extension"
CHROME = ROOT / "source" / "chrome"
TIMESTAMP = str(int(time()))

LANGUAGES = {
    "en-us": SOURCE / "localization" / "en-us.json",
    "zh-cn": SOURCE / "localization" / "zh-cn.json",
}


def read(path: Path) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def write_if_changed(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and read(path) == content:
        return
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("--Changed:", path)


def expand_templates(content: str, base_dir: Path) -> str:
    while "{{{" in content:
        start = content.index("{{{")
        end = content.index("}}}", start) + 3
        config = json.loads(content[start + 3:end - 3])
        include = config.get("")
        if include is None:
            raise RuntimeError(f"Chrome lite build cannot choose from template: {config}")
        replacement = expand_templates(read(base_dir / include), (base_dir / include).parent)
        content = content[:start] + replacement + content[end:]
    return content


def localize(content: str, language: str) -> str:
    strings = json.loads(read(LANGUAGES[language]))
    content = content.replace("{{timestamp}}", TIMESTAMP)
    for key, value in strings.items():
        content = content.replace("{$" + key + "$}", value)
    return content


def build_vt() -> None:
    source = expand_templates(read(SOURCE / "vt.js"), SOURCE)
    for language in LANGUAGES:
        write_if_changed(CHROME / f"vt.{language}.user.js", localize(source, language))


def build_extension_shell() -> None:
    extension = expand_templates(read(SOURCE / "extension.js"), SOURCE)
    extension = extension.replace("{{timestamp}}", TIMESTAMP)
    write_if_changed(CHROME / "extension.chrome.user.js", extension)

    background = expand_templates(read(SOURCE / "background.js"), SOURCE)
    background = background.replace("{{timestamp}}", TIMESTAMP)
    write_if_changed(CHROME / "background.chrome.js", background)


def remove_stale_outputs() -> None:
    stale_files = [
        CHROME / "vt.ja-jp.user.js",
        CHROME / "pre.js",
        CHROME / "preInjected.js",
    ]
    for path in stale_files:
        if path.exists():
            path.unlink()
            print("--Removed:", path)


if __name__ == "__main__":
    build_vt()
    build_extension_shell()
    remove_stale_outputs()
