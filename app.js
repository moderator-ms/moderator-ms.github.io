// --- Supabase Configuration ---
const SUPABASE_URL = 'https://uwbaodztrzofrnomrxde.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3YmFvZHp0cnpvZnJub21yeGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MjIxMzQsImV4cCI6MjEwMTQ5ODEzNH0.D6q734KEJyA0Oh0smjQPXSHZMsil9oMdUEOLaRix4vM';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const seed = [
  {"name": "Sefat Karim", "weekend": "Saturday", "phone": "01781597975", "joining": "01-01-2026"},
  {"name": "Akram", "weekend": "Saturday", "phone": "01871976484", "joining": "08-03-2024"},
  {"name": "Arman Alif", "weekend": "Saturday", "phone": "01406274628", "joining": "04-10-2025"},
  {"name": "Sajedul Islam", "weekend": "Sunday", "phone": "01876608766", "joining": "13-12-2023"},
  {"name": "Tarikul Islam", "weekend": "Sunday", "phone": "01401248381", "joining": "03-01-2026"},
  {"name": "Tonmoy", "weekend": "Sunday", "phone": "01921080031", "joining": "02-11-2026"},
  {"name": "Omar Faruk Majumder", "weekend": "Sunday", "phone": "01675562296", "joining": "31-12-2025"},
  {"name": "Md Sujon", "weekend": "Monday", "phone": "01762946309", "joining": "12-07-2024"},
  {"name": "Mosharof Hossain", "weekend": "Monday", "phone": "01927917924", "joining": "01-01-2026"},
  {"name": "Md Raihan", "weekend": "Monday", "phone": "01931070660", "joining": "27-06-2026"},
  {"name": "Moinul Islam", "weekend": "Tuesday", "phone": "01602871511", "joining": "05-01-2026"},
  {"name": "Sifat Hossain", "weekend": "Tuesday", "phone": "01984382210", "joining": "24-06-2026"},
  {"name": "Shakib Ahmed", "weekend": "Tuesday", "phone": "01321818169", "joining": "28-07-2026"},
  {"name": "Al Arafat", "weekend": "Tuesday", "phone": "01327948737", "joining": "05-01-2026"},
  {"name": "Kowshiq", "weekend": "Wednesday", "phone": "01956363216", "joining": "19-01-2024"},
  {"name": "Mamun", "weekend": "Wednesday", "phone": "01518707855", "joining": "09-07-2025"},
  {"name": "Sahil (Forever)", "weekend": "Wednesday", "phone": "01947127960", "joining": "28-06-2026"},
  {"name": "Najmul Islam", "weekend": "Thursday", "phone": "01782417078", "joining": "17-05-2023"},
  {"name": "Mehadi Hasan", "weekend": "Thursday", "phone": "01646406186", "joining": "22-10-2022"},
  {"name": "Naim Khan", "weekend": "Thursday", "phone": "01615354665", "joining": "09-01-2025"},
  {"name": "Rezaul Karim", "weekend": "Thursday", "phone": "01407722355", "joining": "01-12-2024"},
  {"name": "Sami", "weekend": "Friday", "phone": "01407914895", "joining": "02-10-2024"},
  {"name": "Sahil Sheikh", "weekend": "Friday", "phone": "01626429771", "joining": "05-01-2026"},
  {"name": "Piyal Sarker", "weekend": "Friday", "phone": "01705952384", "joining": "04-01-2026"},
  {"name": "Abu Torab", "weekend": "Friday", "phone": "01722639097", "joining": "28-06-2026"}
];

let mods = [];
let leaves = [];
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Helpers
function isoLocal(d = new Date()) {
  let z = d.getTimezoneOffset() * 60000;
  return new Date(d - z).toISOString().slice(0, 10);
}

function dayOf(s) {
  let [y, m, d] = s.split('-').map(Number);
  return days[new Date(y, m - 1, d).getDay()];
}

function activeLeave(name, date) {
  return leaves.some(x => x.name === name && date >= x.start && date <= x.end);
}

// Initial Data Load
async function init() {
  // Fetch moderators
  let { data: modData, error: modErr } = await db.from('moderators').select('*');
  if (modErr) console.error('Error fetching moderators:', modErr);

  // Seed default data if database table is empty
  if (!modData || modData.length === 0) {
    const { data: inserted } = await db.from('moderators').insert(seed).select();
    mods = inserted || seed;
  } else {
    mods = modData;
  }

  // Fetch leaves
  let { data: leaveData, error: leaveErr } = await db.from('leaves').select('*');
  if (leaveErr) console.error('Error fetching leaves:', leaveErr);
  leaves = (leaveData || []).map(l => ({
    id: l.id,
    name: l.name,
    start: l.start_date,
    end: l.end_date,
    type: l.type,
    reason: l.reason
  }));

  fillLeave();
  dash();
}

// Page Navigation
function show(id) {
  document.querySelectorAll('.page').forEach(x => x.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  if (id === 'dashboard') dash();
  if (id === 'attendance') renderAttendance();
  if (id === 'moderators') renderMods();
  if (id === 'leave') renderLeaves();
}

// Fetch Attendance for Date
async function getAtt(date) {
  const { data } = await db.from('attendance').select('*').eq('date', date);
  const result = {};
  if (data) {
    data.forEach(item => {
      result[item.name] = item.status;
    });
  }
  return result;
}

// Dashboard
async function dash() {
  let date = isoLocal(), day = dayOf(date);
  let a = await getAtt(date);
  let off = mods.filter(x => x.weekend === day);
  let lv = mods.filter(x => activeLeave(x.name, date));

  document.getElementById('total').textContent = mods.length;
  document.getElementById('off').textContent = off.length;
  document.getElementById('leaveCount').textContent = lv.length;
  document.getElementById('present').textContent = Object.values(a).filter(x => x === 'Present').length;
  document.getElementById('absent').textContent = Object.values(a).filter(x => x === 'Absent').length;
  document.getElementById('todayOff').innerHTML = off.length ? off.map(x => '<span class="badge">' + x.name + '</span>').join(' ') : 'No weekly off today.';
}

// Attendance
async function renderAttendance() {
  let date = document.getElementById('attDate').value || isoLocal();
  document.getElementById('attDate').value = date;
  let day = dayOf(date), saved = await getAtt(date);

  document.getElementById('attBody').innerHTML = mods.map((x, i) => {
    let auto = activeLeave(x.name, date) ? 'Leave' : x.weekend === day ? 'Weekly Off' : (saved[x.name] || 'Present');
    return `<tr><td>${i + 1}</td><td>${x.name}</td><td>${x.weekend}</td><td><select data-name="${x.name}" ${auto === 'Weekly Off' ? 'disabled' : ''}><option ${auto === 'Present' ? 'selected' : ''}>Present</option><option ${auto === 'Absent' ? 'selected' : ''}>Absent</option><option ${auto === 'Leave' ? 'selected' : ''}>Leave</option><option ${auto === 'Weekly Off' ? 'selected' : ''}>Weekly Off</option></select></td></tr>`;
  }).join('');
}

async function saveAttendance() {
  let date = document.getElementById('attDate').value;
  let updates = [];

  document.querySelectorAll('#attBody select').forEach(s => {
    updates.push({
      date: date,
      name: s.dataset.name,
      status: s.value
    });
  });

  const { error } = await db.from('attendance').upsert(updates, { onConflict: 'date,name' });
  if (error) {
    alert('Failed to save attendance: ' + error.message);
  } else {
    alert('Attendance saved successfully.');
    dash();
  }
}

// Moderator Management
function renderMods() {
  let q = (document.getElementById('search').value || '').toLowerCase();
  document.getElementById('modBody').innerHTML = mods
    .map((x, i) => ({ x, i }))
    .filter(o => o.x.name.toLowerCase().includes(q))
    .map(o => `<tr><td>${o.i + 1}</td><td>${o.x.name}</td><td>${o.x.weekend}</td><td>${o.x.phone}</td><td>${o.x.joining}</td><td><button class="danger" onclick="delMod(${o.x.id}, ${o.i})">Delete</button></td></tr>`)
    .join('');
}

async function addMod() {
  let name = n.value.trim();
  if (!name) return alert('Enter name');
  
  const newMod = { name, weekend: w.value, phone: p.value, joining: j.value };
  const { data, error } = await db.from('moderators').insert([newMod]).select();

  if (error) return alert('Error adding moderator: ' + error.message);

  mods.push(data[0]);
  n.value = p.value = j.value = '';
  renderMods();
  fillLeave();
}

async function delMod(id, index) {
  if (confirm('Delete this moderator?')) {
    if (id) {
      const { error } = await db.from('moderators').delete().eq('id', id);
      if (error) return alert('Error deleting moderator: ' + error.message);
    }
    mods.splice(index, 1);
    renderMods();
    fillLeave();
    dash();
  }
}

// Leave Management
function fillLeave() {
  leaveMod.innerHTML = mods.map(x => `<option>${x.name}</option>`).join('');
}

async function addLeave() {
  if (!leaveStart.value || !leaveEnd.value) return alert('Select dates');
  if (leaveEnd.value < leaveStart.value) return alert('End date cannot be before start date');

  const record = {
    name: leaveMod.value,
    start_date: leaveStart.value,
    end_date: leaveEnd.value,
    type: leaveType.value,
    reason: leaveReason.value
  };

  const { data, error } = await db.from('leaves').insert([record]).select();
  if (error) return alert('Error adding leave: ' + error.message);

  leaves.push({
    id: data[0].id,
    name: data[0].name,
    start: data[0].start_date,
    end: data[0].end_date,
    type: data[0].type,
    reason: data[0].reason
  });

  leaveReason.value = '';
  renderLeaves();
  dash();
}

function renderLeaves() {
  fillLeave();
  leaveBody.innerHTML = leaves.map((x, i) => `<tr><td>${x.name}</td><td>${x.start}</td><td>${x.end}</td><td>${x.type}</td><td>${x.reason || '-'}</td><td><button class="danger" onclick="delLeave(${x.id}, ${i})">Delete</button></td></tr>`).join('');
}

async function delLeave(id, i) {
  if (id) {
    const { error } = await db.from('leaves').delete().eq('id', id);
    if (error) return alert('Error deleting leave: ' + error.message);
  }
  leaves.splice(i, 1);
  renderLeaves();
  dash();
}

// Reports
async function report() {
  let m = reportMonth.value;
  if (!m) return;

  // Fetch all monthly attendance entries
  const { data: monthAtt } = await db.from('attendance').select('*').gte('date', `${m}-01`).lte('date', `${m}-31`);
  const attMap = {};
  (monthAtt || []).forEach(row => {
    if (!attMap[row.date]) attMap[row.date] = {};
    attMap[row.date][row.name] = row.status;
  });

  let rows = mods.map(x => {
    let p = 0, a = 0, l = 0, o = 0;
    for (let k = 1; k <= 31; k++) {
      let d = m + '-' + String(k).padStart(2, '0');
      if (d > m + '-31') continue;
      let dt = new Date(d + 'T00:00:00');
      if (dt.getMonth() + 1 !== Number(m.slice(5))) continue;

      let dayAtt = attMap[d] ? attMap[d][x.name] : undefined;
      let st = activeLeave(x.name, d) ? 'Leave' : x.weekend === dayOf(d) ? 'Weekly Off' : dayAtt;

      if (st === 'Present') p++;
      if (st === 'Absent') a++;
      if (st === 'Leave') l++;
      if (st === 'Weekly Off') o++;
    }
    return `<tr><td>${x.name}</td><td>${p}</td><td>${a}</td><td>${l}</td><td>${o}</td></tr>`;
  }).join('');

  reportOut.innerHTML = `<div class="tableWrap"><table><thead><tr><th>Name</th><th>Present</th><th>Absent</th><th>Leave</th><th>Weekly Off</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// Clock & Startup Initialization
setInterval(() => clock.textContent = new Date().toLocaleString(), 1000);
attDate.value = isoLocal();
reportMonth.value = isoLocal().slice(0, 7);

init();
