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

// ---------------------- persistence helpers ----------------------
function saveState() {
  const classes = Array.from(document.querySelectorAll('.class-card')).map(card => {
    return {
      id: card.dataset.classId,
      courseName: card.querySelector('.course-name').value || '',
      hue: card.dataset.hue || null,
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
  card.dataset.hue = hue;
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
  let text = `Contribution sum: ${round(contribution)}% (total weight: ${round(totalWeight)}%)`;
  if (Math.abs(totalWeight - 100) > 0.001) {
    text += ` — note: weights don't sum to 100%.`;
  }
  text += '\nDetails:\n' + notes.join(' | ');
  resultEl.textContent = text;
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
  const goal = parseFloat(goalInput.value);
  if (isNaN(goal)) {
    compDiv.querySelector('.comp-note').textContent = 'Set a numeric Goal grade first.';
    return;
  }

  const comps = Array.from(card.querySelectorAll('.component'));
  // total contributions excluding target
  let otherContrib = 0;
  for (const c of comps) {
    if (c === compDiv) continue;
    const avg = parseFloat(c.querySelector('.avg').value);
    const weight = parseFloat(c.querySelector('.weight').value) || 0;
    const avgVal = isNaN(avg) ? 0 : avg;
    otherContrib += (avgVal * weight) / 100;
  }

  const weightTarget = parseFloat(compDiv.querySelector('.weight').value);
  if (isNaN(weightTarget) || weightTarget <= 0) {
    compDiv.querySelector('.comp-note').textContent = 'Set a positive weight for this component.';
    return;
  }

  // needed contribution in percent points
  const neededContrib = goal - otherContrib;
  const requiredAvg = (neededContrib * 100) / weightTarget;

  const noteEl = compDiv.querySelector('.comp-note');
  if (requiredAvg > 100) {
    noteEl.textContent = `Impossible: need ${round(requiredAvg)}% ( >100 ).`;
  } else if (requiredAvg <= 0) {
    noteEl.textContent = `Already achieved: need ≤0% (you can skip).`;
  } else {
    noteEl.textContent = `Need at least ${round(requiredAvg)}% average for this component to reach ${goal}%.`;
  }
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
// ...existing code...