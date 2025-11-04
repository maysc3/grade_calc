// ...existing code...
const MAX_CLASSES = 8;
let nextClassId = 1;
const classesContainer = document.getElementById('classes');
const addClassBtn = document.getElementById('addClassBtn');
const calculateBtn = document.getElementById('calculateBtn');
const summary = document.getElementById('summary');
const goalInput = document.getElementById('goalInput');
const optimizeToggle = document.getElementById('optimizeToggle');

addClassBtn.addEventListener('click', () => { addClass(); saveState(); });
calculateBtn.addEventListener('click', () => calculateAll());
optimizeToggle.addEventListener('change', () => { toggleOptimizeMode(); saveState(); });
goalInput.addEventListener('input', () => saveState());

// load saved state (or create one default class)
loadState();
enableDragAndDrop(); // set up container handlers

// ---------------------- persistence helpers ----------------------
function saveState() {
  const classes = Array.from(document.querySelectorAll('.class-card')).map(card => {
    return {
      id: card.dataset.classId,
      courseName: card.querySelector('.course-name').value || '',
      hue: card.getAttribute('data-hue') || null,
      components: Array.from(card.querySelectorAll('.component')).map(c => ({
        name: c.querySelector('.comp-name').value || '',
        avg: c.querySelector('.avg').value || '',
        weight: c.querySelector('.weight').value || ''
      }))
    };
  });
  const state = {
    nextClassId,
    classes,
    goal: goalInput.value || '',
    optimize: optimizeToggle.checked || false
  };
  try {
    localStorage.setItem('gradeCalcState', JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save state', e);
  }
}

function loadState() {
  const raw = localStorage.getItem('gradeCalcState');
  if (!raw) {
    // no saved state: create initial class
    addClass();
    saveState();
    return;
  }
  try {
    const state = JSON.parse(raw);
    nextClassId = state.nextClassId || 1;
    goalInput.value = state.goal || '';
    optimizeToggle.checked = !!state.optimize;
    // clear any existing
    classesContainer.innerHTML = '';
    if (Array.isArray(state.classes) && state.classes.length) {
      for (const cls of state.classes.slice(0, MAX_CLASSES)) {
        addClassFromState(cls);
      }
    } else {
      addClass();
    }
    updateOptimizeButtons();
  } catch (e) {
    console.warn('Failed to parse saved state', e);
    addClass();
  }
}

// ---------------------- creation & UI (adapted to persist) ----------------------
function addClassFromState(cls) {
  const id = cls.id || (nextClassId++).toString();
  // ensure numeric id increments if using numeric pattern
  if (!isNaN(Number(id)) && Number(id) >= nextClassId) nextClassId = Number(id) + 1;

  const card = document.createElement('div');
  card.className = 'class-card';
  card.dataset.classId = id;

  const hue = cls.hue ?? ((Number(id) * 47) % 360);
  card.setAttribute('data-hue', hue);
  card.style.background = `linear-gradient(135deg, hsl(${hue} 80% 98%), #ffffff)`;
  card.style.borderLeft = `6px solid hsl(${hue} 60% 45%)`;

  card.innerHTML = `
    <div class="card-header">
      <input class="course-name" placeholder="Course name (optional)" />
      <button class="remove-class">Delete Course</button>
    </div>
    <div class="components"></div>
    <div class="card-actions">
      <button class="add-component">Add Component</button>
      <button class="calc-class">Calc Course</button>
    </div>
    <div class="result"></div>
  `;
  classesContainer.appendChild(card);

  const courseInput = card.querySelector('.course-name');
  courseInput.value = cls.courseName || '';
  courseInput.addEventListener('input', saveState);

  card.querySelector('.remove-class').addEventListener('click', () => {
    card.remove();
    saveState();
  });
  card.querySelector('.add-component').addEventListener('click', () => { addComponent(card); saveState(); });
  card.querySelector('.calc-class').addEventListener('click', () => calculateClass(card));

  // add components from state or default one
  if (Array.isArray(cls.components) && cls.components.length) {
    for (const c of cls.components) addComponent(card, c);
  } else {
    addComponent(card);
  }

  makeCardDraggable(card);
}

function addClass() {
  if (classesContainer.children.length >= MAX_CLASSES) {
    alert('Maximum of 8 courses reached.');
    return;
  }
  const id = (nextClassId++).toString();
  addClassFromState({ id });
  updateOptimizeButtons();
  updateGrid();
  saveState();
}

function addComponent(card, compState = {}) {
  const comps = card.querySelector('.components');
  const compId = Date.now().toString(36);
  const div = document.createElement('div');
  div.className = 'component';
  div.dataset.compId = compId;
  div.innerHTML = `
    <input class="comp-name" placeholder="Name (e.g., Quizzes)" />
    <input type="number" class="avg" placeholder="Average %" min="0" max="100" step="0.01" />
    <input type="number" class="weight" placeholder="Weight %" min="0" max="100" step="0.01" />
    <button class="optimize-comp" title="Optimize this component">⚙</button>
    <button class="remove-comp" title="Remove component">−</button>
    <div class="comp-note"></div>
  `;
  comps.appendChild(div);

  const nameIn = div.querySelector('.comp-name');
  const avgIn = div.querySelector('.avg');
  const weightIn = div.querySelector('.weight');
  const optimizeBtn = div.querySelector('.optimize-comp');
  const removeBtn = div.querySelector('.remove-comp');

  nameIn.value = compState.name || '';
  avgIn.value = compState.avg || '';
  weightIn.value = compState.weight || '';

  // save on input
  [nameIn, avgIn, weightIn].forEach(inp => {
    inp.addEventListener('input', saveState);
  });

  removeBtn.addEventListener('click', () => { div.remove(); saveState(); });
  optimizeBtn.addEventListener('click', () => optimizeForComponent(card, div));

  updateOptimizeButtons();
  saveState();
  // ensure results get re-rendered nicely after edits
  card.querySelector('.calc-class')?.addEventListener('click', () => calculateClass(card));
}

// ---------------------- existing calculation & optimize functions ----------------------
function calculateClass(card) {
  const comps = Array.from(card.querySelectorAll('.component'));
  if (comps.length === 0) {
    card.querySelector('.result').textContent = 'No components.';
    return { contribution: 0, totalWeight: 0 };
  }
  let totalWeight = 0;
  let contribution = 0;
  const notes = [];
  for (const c of comps) {
    const name = c.querySelector('.comp-name').value || 'Item';
    const avg = parseFloat(c.querySelector('.avg').value);
    const weight = parseFloat(c.querySelector('.weight').value) || 0;
    const avgVal = isNaN(avg) ? 0 : avg;
    const contrib = (avgVal * weight) / 100;
    totalWeight += weight;
    contribution += contrib;
    notes.push(`${name}: ${avgVal}% × ${weight}% → ${round(contrib)}%`);
  }
  const resultEl = card.querySelector('.result');

  // Build a clean, collapsed details block to avoid clutter
  const summaryText = `Contribution sum: ${round(contribution)}% (total weight: ${round(totalWeight)}%)`;
  const detailsHtml = notes.length ? notes.map(n => `<div class="detail-line">${escapeHtml(n)}</div>`).join('') : '<div class="detail-line">No details</div>';

  let warn = '';
  if (Math.abs(totalWeight - 100) > 0.001) {
    warn = `<div class="weight-warn">Note: weights don't sum to 100%.</div>`;
  }

  resultEl.innerHTML = `
    <div class="result-summary">${escapeHtml(summaryText)} ${warn}</div>
    <details class="result-details">
      <summary>Details</summary>
      <div class="details-body">${detailsHtml}</div>
    </details>
  `;
  return { contribution, totalWeight };
}

function calculateAll() {
  summary.innerHTML = '';
  const cards = Array.from(document.querySelectorAll('.class-card'));
  if (cards.length === 0) {
    summary.textContent = 'No courses to calculate.';
    return;
  }
  for (const card of cards) {
    const name = card.querySelector('.course-name').value || `Course ${card.dataset.classId}`;
    const res = calculateClass(card);
    if (!res) continue;
    const line = document.createElement('div');
    line.className = 'summary-line';
    line.textContent = `${name}: ${round(res.contribution)}% (weight: ${round(res.totalWeight)}%)`;
    summary.appendChild(line);
  }
  const overall = document.createElement('div');
  overall.className = 'overall';
  overall.textContent = `Calculated ${cards.length} course(s). Click individual "Calc Course" to recalc a single course.`;
  summary.appendChild(overall);
}

function optimizeForComponent(card, compDiv) {
  // clear previous notes
  card.querySelectorAll('.comp-note').forEach(n => n.textContent = '');

  const goal = parseFloat(goalInput.value);
  if (isNaN(goal)) {
    compDiv.querySelector('.comp-note').textContent = 'Set a numeric Goal grade first.';
    return;
  }

  const comps = Array.from(card.querySelectorAll('.component'));
  const unknowns = comps.filter(c => {
    const v = c.querySelector('.avg').value;
    return v === '' || v == null || isNaN(parseFloat(v));
  });

  // compute contribution from known components
  let knownContrib = 0;
  for (const c of comps) {
    if (unknowns.includes(c)) continue;
    const avg = parseFloat(c.querySelector('.avg').value);
    const weight = parseFloat(c.querySelector('.weight').value) || 0;
    const avgVal = isNaN(avg) ? 0 : avg;
    knownContrib += (avgVal * weight) / 100;
  }

  // sum weights of unknowns and validate
  const unknownWeights = unknowns.map(c => parseFloat(c.querySelector('.weight').value) || 0);
  const totalUnknownWeight = unknownWeights.reduce((s, v) => s + v, 0);

  // needed contribution in percent points
  const neededContrib = goal - knownContrib;

  if (unknowns.length === 0) {
    // no unknowns — just show message on clicked comp
    compDiv.querySelector('.comp-note').textContent = 'No unknowns to optimize (all averages set).';
    return;
  }

  if (unknowns.length === 1) {
    // single unknown — exact same as before
    const target = unknowns[0];
    const w = parseFloat(target.querySelector('.weight').value);
    if (isNaN(w) || w <= 0) {
      target.querySelector('.comp-note').textContent = 'Set a positive weight for this component.';
      return;
    }
    const requiredAvg = (neededContrib * 100) / w;
    const noteEl = target.querySelector('.comp-note');
    if (requiredAvg > 100) {
      noteEl.textContent = `Impossible: need ${round(requiredAvg)}% ( >100 ).`;
    } else if (requiredAvg <= 0) {
      noteEl.textContent = `Already achieved: need ≤0% (you can skip).`;
    } else {
      noteEl.textContent = `Need at least ${round(requiredAvg)}% average for this component to reach ${goal}%.`;
    }
    return;
  }

  if (unknowns.length === 2) {
    // two unknowns — provide feasible ranges and equal-split suggestion
    const [a, b] = unknowns;
    const w1 = parseFloat(a.querySelector('.weight').value) || 0;
    const w2 = parseFloat(b.querySelector('.weight').value) || 0;

    if (w1 <= 0 || w2 <= 0) {
      unknowns.forEach(u => u.querySelector('.comp-note').textContent = 'Set positive weights for both unknown components.');
      return;
    }

    // If totalUnknownWeight is zero, impossible
    if (totalUnknownWeight <= 0) {
      unknowns.forEach(u => u.querySelector('.comp-note').textContent = 'Unknown components must have positive weights.');
      return;
    }

    // Simple equal-split suggestion (both averages equal)
    const equalAvg = (neededContrib * 100) / (w1 + w2);

    // extreme: if one is max 100, minimum required for the other
    const minA_when_B100 = Math.max(0, (neededContrib - w2) * 100 / w1);
    const minB_when_A100 = Math.max(0, (neededContrib - w1) * 100 / w2);

    // also compute each alone (other = 0)
    const reqA_if_B0 = (neededContrib * 100) / w1;
    const reqB_if_A0 = (neededContrib * 100) / w2;

    // Compose messages
    const msgA = [];
    const msgB = [];

    if (equalAvg > 100) {
      msgA.push(`Even split requires ${round(equalAvg)}% (>100) → impossible with both ≤100.`);
      msgB.push(`Even split requires ${round(equalAvg)}% (>100) → impossible with both ≤100.`);
    } else {
      msgA.push(`Split equally: set both ≈ ${round(equalAvg)}%`);
      msgB.push(`Split equally: set both ≈ ${round(equalAvg)}%`);
    }

    msgA.push(`If other = 100% → need ≥ ${round(minA_when_B100)}% for this`);
    msgB.push(`If other = 100% → need ≥ ${round(minB_when_A100)}% for this`);

    msgA.push(`If other = 0% → need ${round(reqA_if_B0)}%`);
    msgB.push(`If other = 0% → need ${round(reqB_if_A0)}%`);

    // check feasibility: if even with both 100 it's not enough
    if ((w1 + w2) < 0.0001 || (w1 + w2) === 0) {
      unknowns.forEach(u => u.querySelector('.comp-note').textContent = 'Weights invalid.');
      return;
    }
    const maxPossibleFromBoth = w1 + w2; // contribution if both avg=100
    if (neededContrib > maxPossibleFromBoth) {
      // impossible even at 100% on both
      unknowns.forEach(u => u.querySelector('.comp-note').textContent = `Impossible: even both at 100% only add ${round(maxPossibleFromBoth)} points.`);
      return;
    }

    // write messages into both unknown components
    a.querySelector('.comp-note').textContent = msgA.join(' • ');
    b.querySelector('.comp-note').textContent = msgB.join(' • ');
    return;
  }

  // fallback for more than 2 unknowns
  comps.forEach(c => {
    if (unknowns.includes(c)) c.querySelector('.comp-note').textContent = 'Optimization supports up to 2 unknown components.';
  });
}

function toggleOptimizeMode() {
  updateOptimizeButtons();
}

function updateOptimizeButtons() {
  const show = optimizeToggle.checked;
  document.querySelectorAll('.optimize-comp').forEach(btn => {
    btn.style.display = show ? 'inline-block' : 'none';
  });
}

function updateGrid() {
  // grid handled by CSS; placeholder
}

function round(v) {
  return Math.round(v * 100) / 100;
}

// ---------------------- Drag & Drop reordering ----------------------
function makeCardDraggable(card) {
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', card.dataset.classId);
    card.classList.add('dragging');
    // small visual hint
    try { e.dataTransfer.setDragImage(card, 20, 20); } catch (err) {}
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    // persist order and colors immediately
    saveState();
  });
}

function enableDragAndDrop() {
  // container handles drop/reorder
  classesContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    const target = e.target.closest('.class-card');
    document.querySelectorAll('.class-card').forEach(c => c.classList.remove('drop-target'));
    if (target && !target.classList.contains('dragging')) {
      target.classList.add('drop-target');
    }
  });

  classesContainer.addEventListener('dragleave', (e) => {
    const related = e.relatedTarget;
    if (!related || !classesContainer.contains(related)) {
      document.querySelectorAll('.class-card').forEach(c => c.classList.remove('drop-target'));
    }
  });

  classesContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    const draggedEl = classesContainer.querySelector(`[data-class-id="${draggedId}"]`);
    const target = e.target.closest('.class-card');

    if (!draggedEl) return;

    // If dropped on a card, insert before/after based on pointer
    if (target && target !== draggedEl) {
      const rect = target.getBoundingClientRect();
      const middleX = rect.left + rect.width / 2;
      // for grid behavior, decide before/after by horizontal position
      if (e.clientX < middleX) {
        classesContainer.insertBefore(draggedEl, target);
      } else {
        classesContainer.insertBefore(draggedEl, target.nextSibling);
      }
    } else {
      // dropped in empty area or onto itself => append to end
      classesContainer.appendChild(draggedEl);
    }

    // cleanup visuals
    document.querySelectorAll('.class-card').forEach(c => c.classList.remove('drop-target'));
    // explicit save so hue/order persist
    saveState();
  });
}

// ---------------------- small helpers ----------------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
// ...existing code...