#!/usr/bin/env python3
import json
from pathlib import Path
from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM, CS_MODE_THUMB, CS_MODE_LITTLE_ENDIAN

ROOT = Path(__file__).resolve().parents[1]
states_path = ROOT / "artifacts" / "link-selftest" / "states.json"
rom_path = ROOT / "games" / "Super Mario Bros. 3.gba"
out_path = ROOT / "artifacts" / "link-selftest" / "protocol-disassembly.txt"

TARGET_WORDS = {0x6200, 0xFEFE, 0x0000, 0xFDFD, 0xFCFC, 0xFCFD, 0xF00F}
ROM_BASES = (0x08000000, 0x0A000000, 0x0C000000)

states = json.loads(states_path.read_text())
rom = rom_path.read_bytes()

transition = None
for state in states:
    if state.get("protocolTransition"):
        transition = state["protocolTransition"]
        break

if not transition:
    out_path.write_text("No protocol transition captured.\n")
    raise SystemExit(0)

entries = []
seen = set()
for seat, history in enumerate(transition.get("sendHistory", [])):
    for item in history:
        word = int(item.get("word", 0)) & 0xFFFF
        pc = int(item.get("pc", 0)) & 0xFFFFFFFF
        thumb = bool(item.get("thumb"))
        if word not in TARGET_WORDS or not pc:
            continue
        key = (seat, word, pc, thumb)
        if key in seen:
            continue
        seen.add(key)
        entries.append(key)

lines = []
lines.append(
    f"Protocol transition frame={transition.get('detectedAtFrame')} "
    f"seq={transition.get('detectedAtSequence')}"
)

for seat, word, pc, thumb in sorted(entries):
    rom_offset = None
    base_used = None
    for base in ROM_BASES:
        candidate = pc - base
        if 0 <= candidate < len(rom):
            rom_offset = candidate
            base_used = base
            break
    lines.append("")
    lines.append(
        f"=== P{seat} word={word:04X} pc={pc:08X} "
        f"{'THUMB' if thumb else 'ARM'} ==="
    )
    if rom_offset is None:
        lines.append("PC is outside ROM mirror ranges.")
        continue

    before = 64
    after = 96
    start = max(0, rom_offset - before)
    end = min(len(rom), rom_offset + after)
    # Thumb instructions are 2-byte aligned; ARM instructions 4-byte aligned.
    align = 2 if thumb else 4
    start -= start % align
    code = rom[start:end]
    address = base_used + start

    mode = (CS_MODE_THUMB if thumb else CS_MODE_ARM) | CS_MODE_LITTLE_ENDIAN
    md = Cs(CS_ARCH_ARM, mode)
    md.detail = False
    for insn in md.disasm(code, address):
        marker = ">>" if abs(insn.address - pc) <= (4 if thumb else 8) else "  "
        lines.append(
            f"{marker} {insn.address:08X}: {insn.mnemonic:<9} {insn.op_str}"
        )

out_path.write_text("\n".join(lines) + "\n")
print(out_path.read_text())
