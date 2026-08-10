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

const seed = [
  { name: 'Sefat Karim', weekend: 'Saturday', phone: '01781597975', joining: '2026-01-01' },
  { name: 'Akram', weekend: 'Saturday', phone: '01871976484', joining: '2024-03-08' },
  { name: 'Arman Alif', weekend: 'Saturday', phone: '01406274628', joining: '2025-10-04' },
  { name: 'Sajedul Islam', weekend: 'Sunday', phone: '01876608766', joining: '2023-12-13' },
  { name: 'Tarikul Islam', weekend: 'Sunday', phone: '01401248381', joining: '2026-01-03' },
  { name: 'Tonmoy', weekend: 'Sunday', phone: '01921080031', joining: '2026-11-02' },
  { name: 'Omar Faruk Majumder', weekend: 'Sunday', phone: '01675562296', joining: '2025-12-31' },
  { name: 'Md Sujon', weekend: 'Monday', phone: '01762946309', joining: '2024-07-12' },
  { name: 'Mosharof Hossain', weekend: 'Monday', phone: '01927917924', joining: '2026-01-01' },
  { name: 'Md Raihan', weekend: 'Monday', phone: '01931070660', joining: '2026-06-27' },
  { name: 'Moinul Islam', weekend: 'Tuesday', phone: '01602871511', joining: '2026-01-05' },
  { name: 'Sifat Hossain', weekend: 'Tuesday', phone: '01984382210', joining: '2026-06-24' },
  { name: 'Shakib Ahmed', weekend: 'Tuesday', phone: '01321818169', joining: '2026-07-28' },
  { name: 'Al Arafat', weekend: 'Tuesday', phone: '01327948737', joining: '2026-01-05' },
  { name: 'Kowshiq', weekend: 'Wednesday', phone: '01956363216', joining: '2024-01-19' },
  { name: 'Mamun', weekend: 'Wednesday', phone: '01518707855', joining: '2025-07-09' },
  { name: 'Sahil (Forever)', weekend: 'Wednesday', phone: '01947127960', joining: '2026-06-28' },
  { name: 'Najmul Islam', weekend: 'Thursday', phone: '01782417078', joining: '2023-05-17' },
  { name: 'Mehadi Hasan', weekend: 'Thursday', phone: '01646406186', joining: '2022-10-22' },
  { name: 'Naim Khan', weekend: 'Thursday', phone: '01615354665', joining: '2025-01-09' },
  { name: 'Rezaul Karim', weekend: 'Thursday', phone: '01407722355', joining: '2024-12-01' },
  { name: 'Sami', weekend: 'Friday', phone: '01407914895', joining: '2024-10-02' },
  { name: 'Sahil Sheikh', weekend: 'Friday', phone: '01626429771', joining: '2026-01-05' },
  { name: 'Piyal Sarker', weekend: 'Friday', phone: '01705952384', joining: '2026-01-04' },
  { name: 'Abu Torab', weekend: 'Friday', phone: '01722639097', joining: '2026-06-28' }
];

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let mods = [];
let leaves = [];
let nightShifts = [];
let outsideDuty = [];
let attendanceMap = {};
let isAuthenticated = false;

function isoLocal(d = new Date()) {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

function dayOf(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return days[new Date(year, month - 1, day).getDay()];
}

function getStoredState() {
  return JSON.parse(localStorage.getItem(storageKey) || '{}');
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify({ mods, leaves, nightShifts, outsideDuty, attendanceMap }));
}

function statusLabel(mod) {
  const today = isoLocal();
  if (activeOutside(mod.id, today)) return 'Outside';
  if (activeNight(mod.id, today)) return 'Night Shift';
  if (activeLeave(mod.name, today)) return 'On Leave';
  if (mod.weekend === dayOf(today)) return 'Weekly Off';
  return 'Active';
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
  if (!dbEnabled) return null;
  try {
    const snapshot = await db.collection(collectionName).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn(`Firebase fetch exception for ${collectionName}:`, error);
    return null;
  }
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
  if (dbEnabled) {
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

  if (dbEnabled) {
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
  const offList = mods.filter(item => item.weekend === dayName);
  const leaveToday = mods.filter(item => activeLeave(item.name, date));
  const presentList = mods.filter(item => {
    const status = attendance[item.name] || (activeLeave(item.name, date) ? 'Leave' : item.weekend === dayName ? 'Weekly Off' : 'Present');
    return status === 'Present';
  });
  const absentList = mods.filter(item => attendance[item.name] === 'Absent');
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
}

async function renderAttendance() {
  const date = document.getElementById('attDate').value || isoLocal();
  document.getElementById('attDate').value = date;
  const dayName = dayOf(date);
  const saved = await getAttendance(date);

  attBody.innerHTML = mods.map((mod, index) => {
    const auto = activeLeave(mod.name, date)
      ? 'Leave'
      : mod.weekend === dayName
      ? 'Weekly Off'
      : saved[mod.name] || 'Present';
    return `<tr><td>${index + 1}</td><td>${mod.name}</td><td>${mod.weekend}</td><td><select data-name="${mod.name}" ${auto === 'Weekly Off' ? 'disabled' : ''}><option ${auto === 'Present' ? 'selected' : ''}>Present</option><option ${auto === 'Absent' ? 'selected' : ''}>Absent</option><option ${auto === 'Leave' ? 'selected' : ''}>Leave</option><option ${auto === 'Weekly Off' ? 'selected' : ''}>Weekly Off</option></select></td></tr>`;
  }).join('');
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

  if (dbEnabled && !`${mod.id}`.startsWith('local-')) {
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
  openModal(`Edit ${mod.name}`, 'Update weekday, salary, phone, or joining date.', '', `
    <div class="form">
      <input id="editName" placeholder="Name" value="${mod.name}">
      <select id="editWeekend"><option${mod.weekend === 'Saturday' ? ' selected' : ''}>Saturday</option><option${mod.weekend === 'Sunday' ? ' selected' : ''}>Sunday</option><option${mod.weekend === 'Monday' ? ' selected' : ''}>Monday</option><option${mod.weekend === 'Tuesday' ? ' selected' : ''}>Tuesday</option><option${mod.weekend === 'Wednesday' ? ' selected' : ''}>Wednesday</option><option${mod.weekend === 'Thursday' ? ' selected' : ''}>Thursday</option><option${mod.weekend === 'Friday' ? ' selected' : ''}>Friday</option></select>
      <input id="editSalary" type="number" min="0" placeholder="Salary" value="${mod.salary || ''}">
      <input id="editPhone" placeholder="Phone" value="${mod.phone}">
      <input id="editJoining" type="date" value="${mod.joining}">
      <button class="primary" onclick="saveModChanges('${mod.id}')">Save Changes</button>
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

  const updated = { name, weekend, phone, joining };
  if (dbEnabled && !`${mod.id}`.startsWith('local-')) {
   try {
     await db.collection('moderators').doc(mod.id).update(updated);
   } catch (error) {
     console.warn('Failed to update moderator in Firebase:', error);
   }
  }

  Object.assign(mod, updated, { salary });
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
  if (dbEnabled && !leave.id.startsWith('leave-')) {
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
  if (dbEnabled) {
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

  document.body.classList.add('print-mode');
  window.onafterprint = () => document.body.classList.remove('print-mode');
  try {
    window.print();
  } catch (error) {
    console.warn('Print failed:', error);
    alert('Unable to print from this browser. Please use your system print dialog or export the page.');
  } finally {
    setTimeout(() => document.body.classList.remove('print-mode'), 1000);
  }
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
    isAuthenticated = true;
    updateAccessUI();
    renderConfig();
    show('dashboard');
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
  const stored = getStoredState();
  if (stored.nightShifts) nightShifts = stored.nightShifts;
  if (stored.outsideDuty) outsideDuty = stored.outsideDuty;
  if (stored.attendanceMap) attendanceMap = stored.attendanceMap;

  const dbMods = await attemptDbLoad('moderators');
  if (dbMods && dbMods.length > 0) {
    mods = dbMods.map(mod => {
      const local = stored.mods?.find(item => item.id === mod.id || item.name === mod.name);
      return {
        id: mod.id || `db-${Math.random().toString(36).slice(2, 6)}`,
        name: mod.name,
        weekend: mod.weekend,
        phone: mod.phone,
        joining: mod.joining,
        salary: local?.salary || mod.salary || ''
      };
    });
  } else if (stored.mods) {
    mods = stored.mods;
  } else {
    mods = seed.map(item => ({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...item, salary: '' }));
  }

  const dbLeaves = await attemptDbLoad('leaves');
  if (dbLeaves) {
    leaves = dbLeaves.map(item => ({
      id: item.id || `db-${Math.random().toString(36).slice(2, 6)}`,
      name: item.name,
      start: item.start,
      end: item.end,
      type: item.type,
      reason: item.reason
    }));
  } else if (stored.leaves) {
    leaves = stored.leaves;
  }

  const dbNight = await attemptDbLoad('night_shifts');
  if (dbNight) {
    nightShifts = dbNight.map(item => ({
      id: item.id || `night-${Math.random().toString(36).slice(2, 6)}`,
      modId: item.modId || item.mod_id?.toString() || item.modId?.toString(),
      name: item.name,
      start: item.start || item.start_date,
      end: item.end || item.end_date
    }));
  } else if (stored.nightShifts) {
    nightShifts = stored.nightShifts;
  }

  const dbOutside = await attemptDbLoad('outside_duty');
  if (dbOutside) {
    outsideDuty = dbOutside.map(item => ({
      id: item.id || `outside-${Math.random().toString(36).slice(2, 6)}`,
      modId: item.modId || item.mod_id?.toString() || item.modId?.toString(),
      name: item.name,
      start: item.start || item.start_date,
      end: item.end || item.end_date,
      notes: item.notes || item.note || ''
    }));
  } else if (stored.outsideDuty) {
    outsideDuty = stored.outsideDuty;
  }

  if (dbEnabled && dbMods && dbMods.length === 0) {
    try {
      mods = await Promise.all(seed.map(async item => {
        const docRef = await db.collection('moderators').add(item);
        return { id: docRef.id, ...item, salary: '' };
      }));
    } catch (error) {
      console.warn('Failed to seed Firebase moderators:', error);
    }
  }

  fillLeave();
  renderConfig();
  updateAccessUI();
  renderAttendance();
  renderMods();
  renderLeaves();
  reportStart.value = isoLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  reportEnd.value = isoLocal();
  if (printReportBtn) printReportBtn.disabled = true;

  auth.onAuthStateChanged(user => {
    isAuthenticated = !!user;
    renderConfig();
    updateAccessUI();
    if (isAuthenticated) {
      show('dashboard');
    }
  });
}

setInterval(() => { clock.textContent = new Date().toLocaleString(); }, 1000);
init();
