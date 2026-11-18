const MATERIAL_SLICE_META = [
  { category: 'Panel', status: 'done', label: 'Panel done', color: '#1e3a8a' },
  { category: 'Panel', status: 'workInProgress', label: 'Panel work in progress', color: '#93c5fd' },
  { category: 'Panel', status: 'callPutOn', label: 'Panel call put on', color: '#7c3aed' },
  { category: 'Panel', status: 'pending', label: 'Panel pending', color: '#c4b5fd' },
  { category: 'ASD', status: 'done', label: 'ASD done', color: '#166534' },
  { category: 'ASD', status: 'workInProgress', label: 'ASD work in progress', color: '#4ade80' },
  { category: 'ASD', status: 'pending', label: 'ASD pending', color: '#bbf7d0' },
  { category: 'LHS', status: 'done', label: 'LHS done', color: '#7f1d1d' },
  { category: 'LHS', status: 'workInProgress', label: 'LHS work in progress', color: '#ef4444' },
  { category: 'LHS', status: 'pending', label: 'LHS pending', color: '#f9a8d4' },
];

const MATERIAL_DONE_ITEMS = {
  Panel: 'fire alarm control panel',
  ASD: 'aspiration detection unit',
  LHS: 'lhs interface module',
};

module.exports = {
  MATERIAL_SLICE_META,
  MATERIAL_DONE_ITEMS,
};
