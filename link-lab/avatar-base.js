const AVATAR_BASE = {
  male: 'assets/avatar-base/male-base.png',
  female: 'assets/avatar-base/female-base.png'
};

// Ajusta estos valores a la cuadrícula real de tus hojas
const FRAME_W = 64;
const FRAME_H = 96;
const FRAMES_PER_ROW = 4;

// Ajusta el orden de filas según tu hoja
const DIR_ROW = {
  down: 0,
  up: 1,
  left: 2,
  right: 3
};

function getBaseSheet(gender) {
  return gender === 'female' ? AVATAR_BASE.female : AVATAR_BASE.male;
}

function applyBaseSprite(el, state) {
  const gender = state.gender || 'male';
  const dir = state.direction || 'down';
  const frame = state.frame || 0;

  const row = DIR_ROW[dir] ?? 0;
  const col = frame % FRAMES_PER_ROW;

  el.style.backgroundImage = `url("${getBaseSheet(gender)}")`;
  el.style.backgroundPosition = `-${col * FRAME_W}px -${row * FRAME_H}px`;
  el.style.backgroundSize = `${FRAME_W * FRAMES_PER_ROW}px ${FRAME_H * 4}px`;
}
