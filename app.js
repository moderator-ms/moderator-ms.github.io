// Firebase configuration for Moderator-MS project.
const firebaseConfig = {
  apiKey: "AIzaSyCmIPVe2SkazmzF_zgWXpilh0T_KjMskeg",
  authDomain: "moderator-ms.firebaseapp.com",
  projectId: "moderator-ms",
  storageBucket: "moderator-ms.firebasestorage.app",
  messagingSenderId: "25291129708",
  appId: "1:25291129708:web:aeeecd600ab9c4ee572949",
  measurementId: "G-3DFVCVZPHS"
};
const firebaseApp = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const dbEnabled = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('YOUR');
const storageKey = 'moderator-ms-state';
const printReportBtn = document.getElementById('printReportButton');

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let mods = [];
let leaves = [];
let nightShifts = [];
let outsideDuty = [];
let attendanceMap = {};
let unsubscribes = [];
let isAuthenticated = false;

function isoLocal(d = new Date()) {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

function dayOf(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return days[new Date(year, month - 1, day).getDay()];
}

function unsubscribeFirebaseListeners() {
  unsubscribes.forEach(fn => fn && fn());
  unsubscribes = [];
}

function saveState() {
  // Local persistence disabled because Firebase is the single source of truth.
}

function statusLabel(mod) {
  const today = isoLocal();
  if (activeOutside(mod.id, today)) return 'Outside';
  if (activeNight(mod.id, today)) return 'Night Shift';
  if (activeLeave(mod.name, today)) return 'On Leave';
  if (mod.weekend === dayOf(today)) return 'Weekly Off';
  return 'Active';
}

// Determine the effective status for a moderator on a specific date, giving
// precedence to manual attendance overrides (attendance entries), then
// scheduled leaves, then weekend, then present.
function effectiveStatus(mod, date, attendanceObj = {}) {
  const override = attendanceObj && attendanceObj[mod.name];
  if (override) return override;
  if (activeLeave(mod.name, date)) return 'Leave';
  if (mod.weekend === dayOf(date)) return 'Weekly Off';
  return 'Present';
}

function activeLeave(name, date) {
  return leaves.some(item => item.name === name && date >= item.start && date <= item.end);
}

function activeNight(id, date) {
  return nightShifts.some(item => `${item.modId}` === `${id}` && date >= item.start && date <= item.end);
}

function activeOutside(id, date) {
  return outsideDuty.some(item => `${item.modId}` === `${id}` && date >= item.start && date <= item.end);
}

async function attemptDbLoad(collectionName) {
  if (!dbEnabled || !auth.currentUser) return null;
  try {
    const snapshot = await db.collection(collectionName).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn(`Firebase fetch exception for ${collectionName}:`, error);
    return null;
  }
}

async function migrateLocalDataToFirebase() {
  if (!dbEnabled || !auth.currentUser) return;
  const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
  const hasData = (stored.mods?.length || 0) + (stored.leaves?.length || 0) + (stored.nightShifts?.length || 0) + (stored.outsideDuty?.length || 0) + (Object.keys(stored.attendanceMap || {}).length || 0);
  if (!hasData) return;

  try {
    const remoteMods = await attemptDbLoad('moderators') || [];
    const modByName = {};
    remoteMods.forEach(mod => { if (mod.name) modByName[mod.name] = mod.id; });

    if (Array.isArray(stored.mods)) {
      await Promise.all(stored.mods.map(async mod => {
        if (!mod.name) return;
        const existingId = modByName[mod.name];
        if (existingId) {
          await db.collection('moderators').doc(existingId).set({
            name: mod.name,
            weekend: mod.weekend,
            phone: mod.phone,
            joining: mod.joining,
            salary: mod.salary || ''
          }, { merge: true });
        } else {
          const docRef = await db.collection('moderators').add({
            name: mod.name,
            weekend: mod.weekend,
            phone: mod.phone,
            joining: mod.joining,
            salary: mod.salary || ''
          });
          modByName[mod.name] = docRef.id;
        }
      }));
    }

    if (Array.isArray(stored.leaves)) {
      await Promise.all(stored.leaves.map(async leave => {
        if (!leave.name || !leave.start || !leave.end) return;
        const snapshot = await db.collection('leaves')
          .where('name', '==', leave.name)
          .where('start', '==', leave.start)
          .where('end', '==', leave.end)
          .where('type', '==', leave.type)
          .limit(1)
          .get();
        if (!snapshot.empty) return;
        await db.collection('leaves').add({
          name: leave.name,
          start: leave.start,
          end: leave.end,
          type: leave.type,
          reason: leave.reason || ''
        });
      }));
    }

    if (Array.isArray(stored.nightShifts)) {
      await Promise.all(stored.nightShifts.map(async shift => {
        if (!shift.modId || !shift.start || !shift.end) return;
        const remoteId = modByName[shift.name] || shift.modId;
        const snapshot = await db.collection('night_shifts')
          .where('modId', '==', remoteId)
          .where('start', '==', shift.start)
          .where('end', '==', shift.end)
          .limit(1)
          .get();
        if (!snapshot.empty) return;
        await db.collection('night_shifts').add({
          modId: remoteId,
          name: shift.name,
          start: shift.start,
          end: shift.end
        });
      }));
    }

    if (Array.isArray(stored.outsideDuty)) {
      await Promise.all(stored.outsideDuty.map(async duty => {
        if (!duty.modId || !duty.start || !duty.end) return;
        const remoteId = modByName[duty.name] || duty.modId;
        const snapshot = await db.collection('outside_duty')
          .where('modId', '==', remoteId)
          .where('start', '==', duty.start)
          .where('end', '==', duty.end)
          .limit(1)
          .get();
        if (!snapshot.empty) return;
        await db.collection('outside_duty').add({
          modId: remoteId,
          name: duty.name,
          start: duty.start,
          end: duty.end,
          notes: duty.notes || ''
        });
      }));
    }

    if (stored.attendanceMap && typeof stored.attendanceMap === 'object') {
      const attendanceEntries = [];
      Object.keys(stored.attendanceMap).forEach(date => {
        const dayAttendance = stored.attendanceMap[date];
        if (!dayAttendance || typeof dayAttendance !== 'object') return;
        Object.keys(dayAttendance).forEach(name => {
          attendanceEntries.push({ date, name, status: dayAttendance[name] });
        });
      });
      await Promise.all(attendanceEntries.map(item => {
        const id = `${item.date}_${item.name}`;
        return db.collection('attendance').doc(id).set(item);
      }));
    }

    localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn('Failed to migrate local data to Firebase:', error);
  }
}

async function subscribeFirebaseCollections() {
  if (!dbEnabled || !auth.currentUser) return;
  unsubscribeFirebaseListeners();

  const nextMods = db.collection('moderators').onSnapshot(snapshot => {
    mods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), salary: doc.data().salary || '' }));
    fillLeave();
    renderMods();
    dash();
    renderAttendance();
    renderLeaves();
  }, error => console.warn('Realtime moderators subscription failed:', error));
  unsubscribes.push(nextMods);

  const nextLeaves = db.collection('leaves').onSnapshot(snapshot => {
    leaves = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    fillLeave();
    renderLeaves();
    dash();
  }, error => console.warn('Realtime leaves subscription failed:', error));
  unsubscribes.push(nextLeaves);

  const nextNight = db.collection('night_shifts').onSnapshot(snapshot => {
    nightShifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMods();
    dash();
  }, error => console.warn('Realtime night_shifts subscription failed:', error));
  unsubscribes.push(nextNight);

  const nextOutside = db.collection('outside_duty').onSnapshot(snapshot => {
    outsideDuty = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMods();
    dash();
  }, error => console.warn('Realtime outside_duty subscription failed:', error));
  unsubscribes.push(nextOutside);
}

async function loadFirebaseData() {
  if (!dbEnabled || !auth.currentUser) return;

  const dbMods = await attemptDbLoad('moderators');
  mods = dbMods?.map(mod => ({
    id: mod.id,
    name: mod.name,
    weekend: mod.weekend,
    phone: mod.phone,
    joining: mod.joining,
    salary: mod.salary || ''
  })) || [];

  const dbLeaves = await attemptDbLoad('leaves');
  leaves = dbLeaves?.map(item => ({
    id: item.id,
    name: item.name,
    start: item.start,
    end: item.end,
    type: item.type,
    reason: item.reason
  })) || [];

  const dbNight = await attemptDbLoad('night_shifts');
  nightShifts = dbNight?.map(item => ({
    id: item.id,
    modId: item.modId || item.mod_id?.toString() || item.modId?.toString(),
    name: item.name,
    start: item.start || item.start_date,
    end: item.end || item.end_date
  })) || [];

  const dbOutside = await attemptDbLoad('outside_duty');
  outsideDuty = dbOutside?.map(item => ({
    id: item.id,
    modId: item.modId || item.mod_id?.toString() || item.modId?.toString(),
    name: item.name,
    start: item.start || item.start_date,
    end: item.end || item.end_date,
    notes: item.notes || item.note || ''
  })) || [];

  fillLeave();
  renderConfig();
  updateAccessUI();
  dash();
  renderAttendance();
  renderMods();
  renderLeaves();
}

function show(pageId) {
  document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
  document.getElementById(pageId).classList.remove('hidden');
  document.querySelectorAll('nav button').forEach(btn => btn.classList.toggle('active', btn.id === `nav-${pageId}`));
  if (pageId === 'dashboard') dash();
  if (pageId === 'attendance') renderAttendance();
  if (pageId === 'moderators') renderMods();
  if (pageId === 'leave') renderLeaves();
}

function updateAccessUI() {
  document.body.classList.toggle('authenticated', isAuthenticated);
  if (!isAuthenticated) {
    loginOverlay.classList.remove('hidden');
    loginOverlay.classList.add('active');
  } else {
    loginOverlay.classList.add('hidden');
    loginOverlay.classList.remove('active');
  }
}

async function getAttendance(date) {
  if (dbEnabled && auth.currentUser) {
    try {
      const snapshot = await db.collection('attendance').where('date', '==', date).get();
      const map = {};
      snapshot.docs.forEach(doc => {
        const entry = doc.data();
        map[entry.name] = entry.status;
      });
      return map;
    } catch (error) {
      console.warn('Firebase attendance load failed:', error);
    }
  }
  return attendanceMap[date] || {};
}

async function saveAttendance() {
  const date = document.getElementById('attDate').value;
  const updates = [];
  document.querySelectorAll('#attBody select').forEach(select => {
    updates.push({ date, name: select.dataset.name, status: select.value });
  });

  if (dbEnabled && auth.currentUser) {
    try {
      await Promise.all(updates.map(item => {
        const id = `${item.date}_${item.name}`;
        return db.collection('attendance').doc(id).set(item);
      }));
    } catch (error) {
      console.warn('Attendance save failed, using local state:', error);
    }
  }
  attendanceMap[date] = updates.reduce((acc, item) => ({ ...acc, [item.name]: item.status }), {});
  saveState();
  alert('Attendance saved successfully.');
  dash();
}
async function dash() {
  const date = isoLocal();
  const dayName = dayOf(date);
  const attendance = await getAttendance(date);
  // Build lists using effectiveStatus so manual attendance overrides take precedence
  const offList = mods.filter(item => {
    const status = attendance[item.name];
    if (status) return status === 'Weekly Off';
    return item.weekend === dayName;
  });

  const leaveToday = mods.filter(item => {
    const status = attendance[item.name];
    if (status) return status === 'Leave';
    return activeLeave(item.name, date);
  });

  const presentList = mods.filter(item => effectiveStatus(item, date, attendance) === 'Present');
  const absentList = mods.filter(item => effectiveStatus(item, date, attendance) === 'Absent');
  const nightList = mods.filter(item => activeNight(item.id, date));
  const outsideList = mods.filter(item => activeOutside(item.id, date));

  total.textContent = mods.length;
  off.textContent = offList.length;
  leaveCount.textContent = leaveToday.length;
  present.textContent = presentList.length;
  absent.textContent = absentList.length;
  nightCount.textContent = nightList.length;
  outsideCount.textContent = outsideList.length;
  todayOff.innerHTML = offList.length ? offList.map(item => `<span class="badge">${item.name}</span>`).join(' ') : 'No weekly off today.';
  todayNight.innerHTML = nightList.length ? nightList.map(item => `<span class="badge">${item.name}</span>`).join(' ') : 'No night shift assigned today.';
  todayOutside.innerHTML = outsideList.length ? outsideList.map(item => `<span class="badge">${item.name}</span>`).join(' ') : 'No outside duty today.';
  todayAbsent.innerHTML = absentList.length ? absentList.map(item => `<span class="badge">${item.name}</span>`).join(' ') : 'No absences today.';
}

async function renderAttendance() {
  const date = document.getElementById('attDate').value || isoLocal();
  document.getElementById('attDate').value = date;
  const dayName = dayOf(date);
  const saved = await getAttendance(date);
  const query = (document.getElementById('attSearch')?.value || '').toLowerCase();

  // Group moderators by their assigned weekly off day to make it easy to review per-day counts.
  const groups = {};
  days.forEach(d => groups[d] = []);
  groups['Unassigned'] = [];

  mods.forEach(mod => {
    const key = mod.weekend && groups[mod.weekend] ? mod.weekend : 'Unassigned';
    groups[key].push(mod);
  });

  let html = '';
  let globalIndex = 1;
  // Iterate in the order of the days array so groups appear consistently
  for (const dayKey of [...days, 'Unassigned']) {
    const list = groups[dayKey].filter(mod => {
      const text = `${mod.name} ${mod.weekend} ${saved[mod.name] || ''}`.toLowerCase();
      return text.includes(query);
    });
    if (!list.length) continue;

    // Group header with count
    html += `<tr class="groupHeader"><td colspan="4"><strong>${dayKey} (${list.length})</strong></td></tr>`;

    list.forEach(mod => {
      const auto = saved[mod.name] || (activeLeave(mod.name, date) ? 'Leave' : mod.weekend === dayName ? 'Weekly Off' : 'Present');
      html += `<tr><td>${globalIndex++}</td><td>${mod.name}</td><td>${mod.weekend || '-'}</td><td><select data-name="${mod.name}"><option ${auto === 'Present' ? 'selected' : ''}>Present</option><option ${auto === 'Absent' ? 'selected' : ''}>Absent</option><option ${auto === 'Leave' ? 'selected' : ''}>Leave</option><option ${auto === 'Weekly Off' ? 'selected' : ''}>Weekly Off</option></select></td></tr>`;
    });
  }

  attBody.innerHTML = html;
}

function renderMods() {
  const query = (search.value || '').toLowerCase();
  const rows = mods
    .filter(mod => mod.name.toLowerCase().includes(query))
    .map((mod, index) => {
      return `<tr><td>${index + 1}</td><td>${mod.name}</td><td>${mod.weekend}</td><td>${mod.salary || '-'}</td><td>${mod.phone}</td><td>${mod.joining}</td><td><span class="badge">${statusLabel(mod)}</span></td><td><button class="secondary" onclick="openEditMod('${mod.id}')">Edit</button> <button class="secondary" onclick="openAssignNight('${mod.id}')">Night</button> <button class="secondary" onclick="openAssignOutside('${mod.id}')">Outside</button> <button class="ghostBtn" onclick="delMod('${mod.id}')">Delete</button></td></tr>`;
    });
  modBody.innerHTML = rows.join('');
}

async function addMod() {
  const name = modName.value.trim();
  const weekend = modWeekend.value;
  const phone = modPhone.value.trim();
  const joining = modJoining.value;
  const salary = modSalary.value.trim();

  if (!name || !joining) return alert('Please enter name and joining date.');

  const newMod = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    weekend,
    phone,
    joining,
    salary
  };

  if (dbEnabled) {
    try {
      const docRef = await db.collection('moderators').add({ name, weekend, phone, joining, salary });
      newMod.id = docRef.id;
      modName.value = '';
      modPhone.value = '';
      modJoining.value = '';
      modSalary.value = '';
      await loadFirebaseData();
      return;
    } catch (error) {
      console.warn('Failed to save moderator to Firebase:', error);
    }
  }

  mods.push(newMod);
  modName.value = '';
  modPhone.value = '';
  modJoining.value = '';
  modSalary.value = '';
  renderMods();
  fillLeave();
  saveState();
}

async function delMod(id) {
  if (!confirm('Delete this moderator?')) return;
  const mod = mods.find(item => `${item.id}` === `${id}`);
  if (!mod) return;

   if (dbEnabled && mod.id) {
   try {
     await db.collection('moderators').doc(mod.id).delete();
     const nightSnapshot = await db.collection('night_shifts').where('modId', '==', mod.id).get();
     await Promise.all(nightSnapshot.docs.map(doc => doc.ref.delete()));
     const outsideSnapshot = await db.collection('outside_duty').where('modId', '==', mod.id).get();
     await Promise.all(outsideSnapshot.docs.map(doc => doc.ref.delete()));
   } catch (error) {
     console.warn('Failed to delete moderator data from Firebase:', error);
   }
  }

  mods = mods.filter(item => `${item.id}` !== `${id}`);
  leaves = leaves.filter(item => item.name !== mod.name);
  nightShifts = nightShifts.filter(item => `${item.modId}` !== `${id}`);
  outsideDuty = outsideDuty.filter(item => `${item.modId}` !== `${id}`);
  renderMods();
  renderLeaves();
  fillLeave();
  dash();
  saveState();
}

function openEditMod(id) {
  const mod = mods.find(item => `${item.id}` === `${id}`);
  if (!mod) return;
  const night = nightShifts.find(item => `${item.modId}` === `${id}`) || {};
  const outside = outsideDuty.find(item => `${item.modId}` === `${id}`) || {};
  openModal(`Edit ${mod.name}`, 'Update weekday, salary, phone, joining date, or special duties.', '', `
    <div class="form">
      <input id="editName" placeholder="Name" value="${mod.name}">
      <select id="editWeekend"><option${mod.weekend === 'Saturday' ? ' selected' : ''}>Saturday</option><option${mod.weekend === 'Sunday' ? ' selected' : ''}>Sunday</option><option${mod.weekend === 'Monday' ? ' selected' : ''}>Monday</option><option${mod.weekend === 'Tuesday' ? ' selected' : ''}>Tuesday</option><option${mod.weekend === 'Wednesday' ? ' selected' : ''}>Wednesday</option><option${mod.weekend === 'Thursday' ? ' selected' : ''}>Thursday</option><option${mod.weekend === 'Friday' ? ' selected' : ''}>Friday</option></select>
      <input id="editSalary" type="number" min="0" placeholder="Salary" value="${mod.salary || ''}">
      <input id="editPhone" placeholder="Phone" value="${mod.phone}">
      <input id="editJoining" type="date" value="${mod.joining}">
      <button class="primary" onclick="saveModChanges('${mod.id}')">Save Changes</button>
    </div>
    <div class="form dutySection">
      <h4>Night Shift</h4>
      <input id="nightStart" type="date" value="${night.start || ''}">
      <input id="nightEnd" type="date" value="${night.end || ''}">
      <div class="buttonGroup">
        <button class="primary" onclick="saveNightShift('${mod.id}')">Save Night Shift</button>
        <button class="secondary" onclick="removeNightShift('${mod.id}')">Remove Night Shift</button>
      </div>
    </div>
    <div class="form dutySection">
      <h4>Outside Duty</h4>
      <input id="outsideStart" type="date" value="${outside.start || ''}">
      <input id="outsideEnd" type="date" value="${outside.end || ''}">
      <input id="outsideNotes" placeholder="Notes" value="${outside.notes || ''}">
      <div class="buttonGroup">
        <button class="primary" onclick="saveOutsideDuty('${mod.id}')">Save Outside Duty</button>
        <button class="secondary" onclick="removeOutsideDuty('${mod.id}')">Remove Outside Duty</button>
      </div>
    </div>
  `);
}

async function saveModChanges(id) {
  const mod = mods.find(item => `${item.id}` === `${id}`);
  if (!mod) return;
  const name = document.getElementById('editName').value.trim();
  const weekend = document.getElementById('editWeekend').value;
  const salary = document.getElementById('editSalary').value.trim();
  const phone = document.getElementById('editPhone').value.trim();
  const joining = document.getElementById('editJoining').value;

  if (!name || !joining) return alert('Name and joining date are required.');

   const updated = { name, weekend, phone, joining, salary };
  if (dbEnabled) {
   try {
     if (`${mod.id}`.startsWith('local-')) {
       const docRef = await db.collection('moderators').add(updated);
       mod.id = docRef.id;
     } else {
       await db.collection('moderators').doc(mod.id).set(updated, { merge: true });
     }
     await loadFirebaseData();
     closeModal();
     return;
   } catch (error) {
     console.warn('Failed to update moderator in Firebase:', error);
   }
  }

   Object.assign(mod, updated);
  renderMods();
  fillLeave();
  saveState();
  closeModal();
}

function openAssignNight(id) {
  const mod = mods.find(item => `${item.id}` === `${id}`);
  if (!mod) return;
  const assignment = nightShifts.find(item => `${item.modId}` === `${id}`) || {};
  openModal(`Night Shift for ${mod.name}`, 'Set a start and end date for night shift coverage.', '', `
    <div class="form">
      <input id="nightStart" type="date" value="${assignment.start || ''}">
      <input id="nightEnd" type="date" value="${assignment.end || ''}">
      <button class="primary" onclick="saveNightShift('${mod.id}')">Save Night Shift</button>
    </div>
  `);
}

async function saveNightShift(id) {
  const start = document.getElementById('nightStart').value;
  const end = document.getElementById('nightEnd').value;
  if (!start || !end) return alert('Start and end dates are required.');
  if (end < start) return alert('End date cannot be before start date.');

  const mod = mods.find(item => `${item.id}` === `${id}`);
  if (!mod) return;
  const index = nightShifts.findIndex(item => `${item.modId}` === `${id}`);
  const record = { id: index >= 0 ? nightShifts[index].id : `night-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, modId: mod.id, name: mod.name, start, end };
  if (index >= 0) nightShifts[index] = record;
  else nightShifts.push(record);
  if (dbEnabled) {
   try {
     await db.collection('night_shifts').doc(record.id).set({ id: record.id, modId: record.modId, name: record.name, start: record.start, end: record.end });
   } catch (error) {
     console.warn('Failed to save night shift to Firebase:', error);
   }
  }
  renderMods();
  dash();
  saveState();
  closeModal();
}

function openAssignOutside(id) {
  const mod = mods.find(item => `${item.id}` === `${id}`);
  if (!mod) return;
  const duty = outsideDuty.find(item => `${item.modId}` === `${id}`) || {};
  openModal(`Outside Duty for ${mod.name}`, 'Set outside duty dates and add a short note.', '', `
    <div class="form">
      <input id="outsideStart" type="date" value="${duty.start || ''}">
      <input id="outsideEnd" type="date" value="${duty.end || ''}">
      <input id="outsideNotes" placeholder="Notes" value="${duty.notes || ''}">
      <button class="primary" onclick="saveOutsideDuty('${mod.id}')">Save Outside Duty</button>
    </div>
  `);
}

async function saveOutsideDuty(id) {
  const start = document.getElementById('outsideStart').value;
  const end = document.getElementById('outsideEnd').value;
  const notes = document.getElementById('outsideNotes').value.trim();
  if (!start || !end) return alert('Start and end dates are required.');
  if (end < start) return alert('End date cannot be before start date.');

  const mod = mods.find(item => `${item.id}` === `${id}`);
  if (!mod) return;
  const index = outsideDuty.findIndex(item => `${item.modId}` === `${id}`);
  const record = { id: index >= 0 ? outsideDuty[index].id : `outside-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, modId: mod.id, name: mod.name, start, end, notes };
  if (index >= 0) outsideDuty[index] = record;
  else outsideDuty.push(record);
  if (dbEnabled) {
   try {
     await db.collection('outside_duty').doc(record.id).set({ id: record.id, modId: record.modId, name: record.name, start: record.start, end: record.end, notes: record.notes });
   } catch (error) {
     console.warn('Failed to save outside duty to Firebase:', error);
   }
  }
  renderMods();
  dash();
  saveState();
  closeModal();
}

async function removeNightShift(id) {
  const index = nightShifts.findIndex(item => `${item.modId}` === `${id}`);
  if (index < 0) return alert('No night shift assigned to this moderator.');
  const record = nightShifts[index];
  nightShifts.splice(index, 1);
  if (dbEnabled && record?.id) {
    try {
      await db.collection('night_shifts').doc(record.id).delete();
    } catch (error) {
      console.warn('Failed to remove night shift from Firebase:', error);
    }
  }
  renderMods();
  dash();
  saveState();
  closeModal();
}

async function removeOutsideDuty(id) {
  const index = outsideDuty.findIndex(item => `${item.modId}` === `${id}`);
  if (index < 0) return alert('No outside duty assigned to this moderator.');
  const record = outsideDuty[index];
  outsideDuty.splice(index, 1);
  if (dbEnabled && record?.id) {
    try {
      await db.collection('outside_duty').doc(record.id).delete();
    } catch (error) {
      console.warn('Failed to remove outside duty from Firebase:', error);
    }
  }
  renderMods();
  dash();
  saveState();
  closeModal();
}

function fillLeave() {
  leaveMod.innerHTML = mods.map(mod => `<option value="${mod.name}">${mod.name}</option>`).join('');
}

async function addLeave() {
  if (!leaveStart.value || !leaveEnd.value) return alert('Select dates');
  if (leaveEnd.value < leaveStart.value) return alert('End date cannot be before start date');

  const leave = {
    id: `leave-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: leaveMod.value,
    start: leaveStart.value,
    end: leaveEnd.value,
    type: leaveType.value,
    reason: leaveReason.value.trim() || 'No reason provided'
  };

  if (dbEnabled) {
   try {
     await db.collection('leaves').doc(leave.id).set({ name: leave.name, start: leave.start, end: leave.end, type: leave.type, reason: leave.reason });
   } catch (error) {
     console.warn('Failed to save leave to Firebase:', error);
   }
  }

  leaves.push(leave);
  leaveReason.value = '';
  renderLeaves();
  dash();
  saveState();
}

function renderLeaves() {
  fillLeave();
  leaveBody.innerHTML = leaves.map(leave => `<tr><td>${leave.name}</td><td>${leave.start}</td><td>${leave.end}</td><td>${leave.type}</td><td>${leave.reason || '-'}</td><td><button class="ghostBtn" onclick="delLeave('${leave.id}')">Delete</button></td></tr>`).join('');
}

async function delLeave(id) {
  const leave = leaves.find(item => item.id === id);
  if (!leave) return;
  if (!confirm('Delete this leave?')) return;
   if (dbEnabled && leave.id) {
   try {
     await db.collection('leaves').doc(leave.id).delete();
   } catch (error) {
     console.warn('Failed to delete leave from Firebase:', error);
   }
  }
  leaves = leaves.filter(item => item.id !== id);
  renderLeaves();
  dash();
  saveState();
}

function getRange(start, end) {
  const result = [];
  let current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    result.push(isoLocal(current));
    current.setDate(current.getDate() + 1);
  }
  return result;
}

async function generateReport() {
  const start = reportStart.value;
  const end = reportEnd.value;
  if (!start || !end) return alert('Choose a date range before generating the report.');
  if (end < start) return alert('End date cannot be before start date.');

  const type = reportType.value;
  const dateRange = getRange(start, end);
  let attendanceRange = {};
  if (dbEnabled && auth.currentUser) {
   try {
     const snapshot = await db.collection('attendance').where('date', '>=', start).where('date', '<=', end).get();
     snapshot.docs.forEach(doc => {
       const item = doc.data();
       if (!attendanceRange[item.date]) attendanceRange[item.date] = {};
       attendanceRange[item.date][item.name] = item.status;
     });
   } catch (error) {
     console.warn('Failed to load attendance report from Firebase:', error);
   }
  } else {
    attendanceRange = attendanceMap;
  }

  const rows = mods.map(mod => {
    const summary = { name: mod.name, present: 0, absent: 0, leave: 0, off: 0, night: 0, outside: 0, notes: [] };
    dateRange.forEach(day => {
      const status = (attendanceRange[day] || {})[mod.name] || (activeLeave(mod.name, day) ? 'Leave' : mod.weekend === dayOf(day) ? 'Weekly Off' : 'Present');
      if (status === 'Present') summary.present++;
      if (status === 'Absent') summary.absent++;
      if (status === 'Leave') summary.leave++;
      if (status === 'Weekly Off') summary.off++;
      if (activeNight(mod.id, day)) summary.night++;
      if (activeOutside(mod.id, day)) {
        summary.outside++;
        const duty = outsideDuty.find(item => `${item.modId}` === `${mod.id}` && day >= item.start && day <= item.end);
        if (duty) summary.notes.push(`${day}: ${duty.notes || 'No note'}`);
      }
    });
    return summary;
  });

  let header = '<th>Moderator</th>';
  if (type === 'all' || type === 'attendance') header += '<th>Present</th><th>Absent</th>';
  if (type === 'all' || type === 'leave') header += '<th>Leave</th>';
  if (type === 'all' || type === 'attendance') header += '<th>Weekly Off</th>';
  if (type === 'all' || type === 'night') header += '<th>Night Shifts</th>';
  if (type === 'all' || type === 'outside') header += '<th>Outside Duty</th>';

  let rowsHtml = rows
    .filter(summary => {
      if (type === 'leave') return summary.leave > 0;
      if (type === 'night') return summary.night > 0;
      if (type === 'outside') return summary.outside > 0;
      return true;
    })
    .map(summary => {
      let row = `<tr><td>${summary.name}</td>`;
      if (type === 'all' || type === 'attendance') row += `<td>${summary.present}</td><td>${summary.absent}</td>`;
      if (type === 'all' || type === 'leave') row += `<td>${summary.leave}</td>`;
      if (type === 'all' || type === 'attendance') row += `<td>${summary.off}</td>`;
      if (type === 'all' || type === 'night') row += `<td>${summary.night}</td>`;
      if (type === 'all' || type === 'outside') row += `<td>${summary.outside}</td>`;
      row += '</tr>';
      return row;
    })
    .join('');

  if (!rowsHtml) rowsHtml = `<tr><td colspan="${header.split('<th>').length - 1}">No records found in this range.</td></tr>`;

  const notesSection = (type === 'all' || type === 'outside') && rows.some(s => s.notes.length)
    ? `<div class="panel"><h3>Outside Duty Notes</h3>${rows.filter(s => s.notes.length).map(s => `<p><strong>${s.name}:</strong> ${s.notes.join('; ')}</p>`).join('')}</div>`
    : '';
  const typeLabel = ({ all: 'All Records', attendance: 'Attendance', leave: 'Leave', night: 'Night Shift', outside: 'Outside Duty' })[type] || 'Custom Report';

  reportOut.innerHTML = `
    <div class="panel reportPrintSection">
      <div class="reportPrintHeader">
        <h2>Moderator Report</h2>
        <p>${typeLabel} | ${start} to ${end} | Generated: ${isoLocal()}</p>
      </div>
      <p class="sectionNote">Showing ${type === 'all' ? 'all details' : type.replace('-', ' ')} for the selected date range.</p>
      <div class="tableWrap"><table><thead><tr>${header}</tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </div>
    ${notesSection}
  `;
  if (printReportBtn) printReportBtn.disabled = false;
}

function printReport() {
  if (!reportOut.innerHTML.trim()) {
    alert('Generate a report first before printing.');
    return;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Unable to open print preview. Please allow popups for this site.');
    return;
  }

  const styles = `
    <style>
      body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #fff; margin: 0; padding: 24px; }
      h2, h3, p, table { color: #111; }
      .reportPrintHeader { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:18px; }
      .reportPrintHeader h2 { margin:0; font-size:1.5rem; }
      .reportPrintHeader p { margin:0; color:#444; font-size:.95rem; }
      table { width:100%; border-collapse:collapse; margin-top:18px; }
      th, td { border:1px solid #333; padding:12px 14px; text-align:left; }
      th { background:#f3f3f3; }
      tbody tr:nth-child(even){ background:#fafafa; }
      .sectionNote { color:#555; margin:0 0 16px; }
      .notes { margin-top:24px; }
      .notes h3 { margin-bottom:12px; }
      .notes p { margin:8px 0; }
    </style>
  `;

  const content = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Print Report</title>
        ${styles}
      </head>
      <body>
        ${reportOut.innerHTML}
      </body>
    </html>
  `;

  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
    printWindow.close();
  };
}

function renderConfig() {
  const user = auth.currentUser;
  configEmail.value = user ? user.email : '';
  configPassword.value = '';
  currentEmail.textContent = user ? user.email : 'Not signed in';
  currentPassword.textContent = user ? '********' : 'Not signed in';
}

async function saveConfig() {
  const user = auth.currentUser;
  if (!user) return alert('No authenticated user found. Please log in first.');

  const email = configEmail.value.trim();
  const password = configPassword.value.trim();
  if (!email || !password) return alert('Enter both email and password.');

  try {
    if (email !== user.email) {
      await user.updateEmail(email);
    }
    await user.updatePassword(password);
    renderConfig();
    alert('Login credentials updated successfully. Use the new email and password next time you sign in.');
  } catch (error) {
    console.warn('Failed to update Firebase credentials:', error);
    if (error.code === 'auth/requires-recent-login') {
      alert('Please log out and log in again before updating credentials.');
      return;
    }
    alert(error.message || 'Unable to update login credentials.');
  }
}

function openModal(title, subtitle, cssClass, contentHtml) {
  modalTitle.textContent = title;
  modalSubtitle.textContent = subtitle;
  modalContent.innerHTML = contentHtml;
  modalOverlay.classList.remove('hidden');
}

function closeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  modalOverlay.classList.add('hidden');
  modalTitle.textContent = '';
  modalSubtitle.textContent = '';
  modalContent.innerHTML = '';
}

async function handleLogin() {
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();
  if (!email || !password) return alert('Enter both email and password.');

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    console.warn('Firebase login failed:', error);
    alert(error.message || 'Invalid credentials. Please verify your username and password.');
  }
}

async function logout() {
  try {
    await auth.signOut();
  } catch (error) {
    console.warn('Firebase sign-out failed:', error);
  }
  isAuthenticated = false;
  updateAccessUI();
  loginEmail.value = '';
  loginPassword.value = '';
}

async function openDashboardModal(type) {
  const date = isoLocal();
  const dayName = dayOf(date);
  const attendance = await getAttendance(date);
  const titleMap = {
    total: 'All Moderators',
    present: 'Present Today',
    off: 'Weekly Off Today',
    leave: 'On Leave Today',
    absent: 'Absent Today',
    night: 'Night Shift Today',
    outside: 'Outside Duty Today'
  };
  const title = titleMap[type] || 'Details';
  let items = [];
  if (type === 'total') {
    items = mods.map(mod => `${mod.name} — ${mod.weekend} — ${mod.salary ? `Salary: ${mod.salary}` : 'Salary unset'}`);
  }
  if (type === 'present') {
    items = mods.filter(mod => {
      const status = attendance[mod.name] || (activeLeave(mod.name, date) ? 'Leave' : mod.weekend === dayName ? 'Weekly Off' : 'Present');
      return status === 'Present';
    }).map(mod => mod.name);
  }
  if (type === 'off') {
    items = mods.filter(mod => mod.weekend === dayName).map(mod => mod.name);
  }
  if (type === 'leave') {
    items = mods.filter(mod => activeLeave(mod.name, date)).map(mod => `${mod.name} (${leaves.find(l => l.name === mod.name && date >= l.start && date <= l.end)?.type || 'Leave'})`);
  }
  if (type === 'absent') {
    items = mods.filter(mod => attendance[mod.name] === 'Absent').map(mod => mod.name);
  }
  if (type === 'night') {
    items = mods.filter(mod => activeNight(mod.id, date)).map(mod => {
      const shift = nightShifts.find(n => `${n.modId}` === `${mod.id}` && date >= n.start && date <= n.end);
      return `${mod.name} (${shift?.start} → ${shift?.end})`;
    });
  }
  if (type === 'outside') {
    items = mods.filter(mod => activeOutside(mod.id, date)).map(mod => {
      const duty = outsideDuty.find(o => `${o.modId}` === `${mod.id}` && date >= o.start && date <= o.end);
      return `${mod.name} (${duty?.notes || 'No notes'})`;
    });
  }

  if (!items.length) {
    items = ['No records available for this section.'];
  }
  openModal(title, `Data for ${date}.`, '', `<div class="panel"><ul>${items.map(item => `<li>${item}</li>`).join('')}</ul></div>`);
}

async function init() {
  mods = [];
  leaves = [];
  nightShifts = [];
  outsideDuty = [];
  attendanceMap = {};

  fillLeave();
  renderConfig();
  updateAccessUI();
  renderAttendance();
  renderMods();
  renderLeaves();
  reportStart.value = isoLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  reportEnd.value = isoLocal();
  if (printReportBtn) printReportBtn.disabled = true;

  auth.onAuthStateChanged(async user => {
    isAuthenticated = !!user;
    renderConfig();
    updateAccessUI();
    if (isAuthenticated) {
      await migrateLocalDataToFirebase();
      await loadFirebaseData();
      await subscribeFirebaseCollections();
      show('dashboard');
    }
  });

  if (auth.currentUser) {
    isAuthenticated = true;
    renderConfig();
    updateAccessUI();
    await migrateLocalDataToFirebase();
    await loadFirebaseData();
    await subscribeFirebaseCollections();
    show('dashboard');
  }
}

setInterval(() => { clock.textContent = new Date().toLocaleString(); }, 1000);
init();
