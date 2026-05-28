let _data = null;

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export async function loadContent() {
  if (_data) return _data;
  const [situations, customerTypes, dialogues] = await Promise.all([
    loadJSON('data/situations.json'),
    loadJSON('data/customer_types.json'),
    loadJSON('data/dialogues.json'),
  ]);

  const sitById = Object.fromEntries(situations.map(s => [s.id, s]));
  const typeById = Object.fromEntries(customerTypes.map(t => [t.id, t]));

  const reactionsKey = (typeId, resp) => `${typeId}::${resp}`;
  const reactionMap = Object.fromEntries(
    dialogues.reactions.map(r => [reactionsKey(r.customer_type_id, r.response_type), r])
  );

  _data = {
    situations,
    customerTypes,
    sitById,
    typeById,
    openings: dialogues.openings,
    reactionMap,
    playerLines: dialogues.player_lines,
  };
  return _data;
}

export function getData() {
  if (!_data) throw new Error('content not loaded yet');
  return _data;
}

export function pickRandomCombo() {
  const { openings, sitById, typeById } = getData();
  const opening = openings[Math.floor(Math.random() * openings.length)];
  const situation = sitById[opening.situation_id];
  const customerType = typeById[opening.customer_type_id];
  const name = opening.name || pickRandom(customerType.name_examples);
  return { opening, situation, customerType, name };
}

export function getReaction(customerTypeId, responseType) {
  const { reactionMap } = getData();
  return reactionMap[`${customerTypeId}::${responseType}`] || null;
}

export function pickPlayerLine(responseType) {
  const { playerLines } = getData();
  const lines = playerLines[responseType] || ['—'];
  return pickRandom(lines);
}

export function getPlayerLineExample(responseType) {
  const { playerLines } = getData();
  const lines = playerLines[responseType] || ['—'];
  return lines[0];
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
