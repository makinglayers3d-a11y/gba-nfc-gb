#!/usr/bin/env python3
import json
from pathlib import Path
from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM, CS_MODE_THUMB, CS_MODE_LITTLE_ENDIAN
import struct

ROOT = Path(__file__).resolve().parents[1]
artifact_root = ROOT / "artifacts"
candidates = sorted(
    p for p in artifact_root.glob("link-selftest*")
    if p.is_dir() and (p / "states.json").exists()
)
if not candidates:
    raise SystemExit("No Link selftest states.json found")
selftest_dir = candidates[-1]
states_path = selftest_dir / "states.json"
rom_path = ROOT / "games" / "Super Mario Bros. 3.gba"
out_path = selftest_dir / "protocol-disassembly.txt"

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

# Add broad protocol routines even if a particular word writer was not
# captured in this run. This lets us follow the validation/error branches.
STATIC_RANGES = [
    (0x080C9C80, 0xC0, True, "error 0x60 branch"),
    (0x080C96E0, 0xC0, True, "SIOMULTI read/copy helper"),
    (0x080C971C, 0x100, True, "SIOMULTI receive snapshot helper"),
    (0x080C9948, 0x430, True, "main link state machine"),
    (0x080C9E6C, 0x180, True, "link status helper"),
    (0x080C9900, 0x48, True, "link reset/start helper"),
]

def literal_annotation(insn, rom, base_used):
    # Resolve Thumb literal loads of the form: ldr rN, [pc, #imm].
    if insn.mnemonic != "ldr" or "[pc" not in insn.op_str:
        return ""
    try:
        rhs = insn.op_str.split("[pc", 1)[1].split("]", 1)[0]
        imm = 0
        if "#" in rhs:
            token = rhs.split("#", 1)[1].split(",", 1)[0].strip()
            imm = int(token, 0)
        literal_addr = ((insn.address + 4) & ~3) + imm
        off = literal_addr - base_used
        if 0 <= off <= len(rom) - 4:
            value = struct.unpack_from("<I", rom, off)[0]
            return f" ; [0x{literal_addr:08X}]=0x{value:08X}"
    except Exception:
        pass
    return ""

for start_addr, size, thumb, label in STATIC_RANGES:
    lines.append("")
    lines.append(f"=== STATIC {label} {start_addr:08X}+{size:X} ===")
    base_used = 0x08000000
    start = start_addr - base_used
    end = min(len(rom), start + size)
    if start < 0 or start >= len(rom):
        lines.append("Range outside ROM.")
        continue
    mode = (CS_MODE_THUMB if thumb else CS_MODE_ARM) | CS_MODE_LITTLE_ENDIAN
    md = Cs(CS_ARCH_ARM, mode)
    md.detail = False
    for insn in md.disasm(rom[start:end], start_addr):
        ann = literal_annotation(insn, rom, base_used)
        lines.append(f"   {insn.address:08X}: {insn.mnemonic:<9} {insn.op_str}{ann}")

out_path.write_text("\n".join(lines) + "\n")
print(out_path.read_text())
