// ============================================================
// TADOBA SENTINEL — Mock Data
// ============================================================

export const MOCK_USER = {
  id: 'u-001',
  name: 'Field Operator',
  role: 'Operator',
  division: 'Field Operations',
  avatar: null,
  initials: 'FO',
};

// ---- ALERTS ----
export const MOCK_ALERTS = [
  {
    id: 'ALT-024', type: 'wildlife', species: 'Tiger', description: 'Tiger sighting',
    source: 'Camera 07', zone: 'Buffer Zone', priority: 'high', status: 'needs_verification',
    time: '10:22 AM', date: '2026-10-15', lat: 20.3155, lng: 79.3947,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Walking_tiger_female.jpg/1200px-Walking_tiger_female.jpg',
    identityStatus: 'not_confirmed', candidateId: 'T-12',
    timeline: [
      { time: '10:22 AM', label: 'Alert received', desc: 'Automatic detection from Camera 07', done: true },
      { time: '10:23 AM', label: 'Assigned to operator', desc: 'Operator notified in field operations', done: true },
      { time: null, label: 'Pending Verification', desc: 'Review images and plan response', done: false },
    ],
  },
  {
    id: 'ALT-023', type: 'wildlife', species: 'Leopard', description: 'Leopard sighting',
    source: 'Camera 12', zone: 'Core Zone', priority: 'medium', status: 'in_review',
    time: '10:06 AM', date: '2026-10-15', lat: 20.3200, lng: 79.3900,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Leopard_in_Yala_National_Park_01.jpg/1200px-Leopard_in_Yala_National_Park_01.jpg',
    identityStatus: 'not_confirmed', candidateId: 'L-04',
    timeline: [
      { time: '10:06 AM', label: 'Alert received', desc: 'Automatic detection from Camera 12', done: true },
      { time: '10:07 AM', label: 'Under automated analysis', desc: 'Re-ID pipeline running', done: true },
    ],
  },
  {
    id: 'ALT-022', type: 'device', species: null, description: 'Camera offline',
    source: 'Camera 03', zone: 'Buffer Zone', priority: 'low', status: 'new',
    time: '09:55 AM', date: '2026-10-15', lat: 20.3100, lng: 79.3850,
    image: null, identityStatus: null, candidateId: null,
    timeline: [
      { time: '09:55 AM', label: 'Device alert', desc: 'Camera 03 stopped sending heartbeats', done: true },
    ],
  },
  {
    id: 'ALT-021', type: 'wildlife', species: 'Tiger', description: 'Tiger sighting',
    source: 'Camera 16', zone: 'Core Zone', priority: 'high', status: 'assigned',
    time: '09:42 AM', date: '2026-10-15', lat: 20.3250, lng: 79.4000,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Walking_tiger_female.jpg/1200px-Walking_tiger_female.jpg',
    identityStatus: 'confirmed', candidateId: 'T-08',
    timeline: [
      { time: '09:42 AM', label: 'Alert received', desc: 'Automatic detection from Camera 16', done: true },
      { time: '09:43 AM', label: 'Mission dispatched', desc: 'Drone D-02 assigned automatically', done: true },
      { time: '09:44 AM', label: 'Team assigned', desc: 'Field Response Team notified', done: true },
    ],
  },
  {
    id: 'ALT-020', type: 'wildlife', species: 'Bear', description: 'Animal movement',
    source: 'Camera 09', zone: 'Buffer Zone', priority: 'medium', status: 'resolved',
    time: '09:10 AM', date: '2026-10-15', lat: 20.3080, lng: 79.3920,
    image: null, identityStatus: null, candidateId: null,
    timeline: [
      { time: '09:10 AM', label: 'Alert received', desc: 'Movement detected by Camera 09', done: true },
      { time: '09:25 AM', label: 'Resolved', desc: 'Animal moved out of sensitive area', done: true },
    ],
  },
  {
    id: 'ALT-019', type: 'wildlife', species: 'Tiger', description: 'Tiger sighting',
    source: 'Camera 04', zone: 'Core Zone', priority: 'high', status: 'resolved',
    time: '08:55 AM', date: '2026-10-15', lat: 20.3300, lng: 79.4050,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Walking_tiger_female.jpg/1200px-Walking_tiger_female.jpg',
    identityStatus: 'confirmed', candidateId: 'T-19',
    timeline: [],
  },
];

// ---- MISSIONS ----
export const MOCK_MISSIONS = [
  {
    id: 'MSN-024', title: 'Tiger image capture', status: 'in_progress',
    alertId: 'ALT-024', source: 'Camera 07', zone: 'Buffer Zone',
    drone: 'Drone D-01', droneStatus: 'connected', droneMode: 'simulated',
    battery: 78, altitude: 40, speed: 0, mode: 'Hold',
    stage: 2, // 0=approved,1=en_route,2=capture,3=return,4=review
    capturedImages: [
      { id: 'f01', label: 'Frame 01', time: '10:28:34', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Walking_tiger_female.jpg/800px-Walking_tiger_female.jpg' },
      { id: 'f02', label: 'Frame 02', time: '10:28:39', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Walking_tiger_female.jpg/800px-Walking_tiger_female.jpg' },
      { id: 'f03', label: 'Frame 03', time: '10:28:45', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Walking_tiger_female.jpg/800px-Walking_tiger_female.jpg' },
    ],
    activityLog: [
      { time: '10:25', label: 'Mission approved', desc: 'Approved for drone deployment', done: true },
      { time: '10:26', label: 'Takeoff confirmed', desc: 'Drone D-01 airborne', done: true },
      { time: '10:28', label: 'Capture started', desc: 'Arrived at waypoint, capturing images', done: true },
    ],
    checklist: [
      { id: 1, label: 'Verify alert', desc: 'Confirm alert details and location', done: true },
      { id: 2, label: 'Approve mission', desc: 'Obtain approval for deployment', done: true },
      { id: 3, label: 'Reach waypoint', desc: 'Navigate to alert location', done: true },
      { id: 4, label: 'Capture images', desc: 'Collect clear images of the animal', active: true, action: 'capture' },
      { id: 5, label: 'Review identity match', desc: 'Check against known individuals', done: false },
      { id: 6, label: 'Record outcome', desc: 'Log findings and add notes', done: false },
    ],
    lat: 20.3155, lng: 79.3947,
  },
  {
    id: 'MSN-025', title: 'Camera inspection', status: 'awaiting_readiness',
    alertId: 'ALT-022', source: 'Camera 03', zone: 'Buffer Zone',
    drone: 'Drone D-02', droneStatus: 'connected', droneMode: 'simulated',
    battery: 62, altitude: 0, speed: 0, mode: 'Standby',
    stage: 0, capturedImages: [], activityLog: [],
    checklist: [
      { id: 1, label: 'Verify alert', desc: 'Confirm alert details and location', done: false },
      { id: 2, label: 'Check readiness', desc: 'Validate drone and mission parameters', active: true },
    ],
    lat: 20.3100, lng: 79.3850,
  },
  {
    id: 'MSN-023', title: 'Buffer zone survey', status: 'completed',
    alertId: null, source: 'Scheduled', zone: 'Buffer Zone',
    drone: 'Drone D-03', droneStatus: 'connected', droneMode: 'simulated',
    battery: 91, altitude: 0, speed: 0, mode: 'Landed',
    stage: 4, capturedImages: [], activityLog: [
      { time: '08:00', label: 'Mission completed', desc: 'Survey finished, drone landed', done: true },
    ],
    checklist: [],
    lat: 20.3050, lng: 79.3800,
  },
];

// ---- ANIMALS ----
export const MOCK_ANIMALS = [
  {
    id: 'T-12', species: 'Bengal tiger', name: 'T-12', status: 'verified',
    lastSeen: '2 min ago', lastCamera: 'Camera 07', zone: 'Buffer Zone',
    sightings: 18, referenceImages: 6,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Walking_tiger_female.jpg/800px-Walking_tiger_female.jpg',
    sightingHistory: [
      { time: 'Today, 10:22', camera: 'Camera 07', note: 'Walking along forest trail' },
      { time: 'Yesterday, 17:45', camera: 'Camera 12', note: 'Moving through dense vegetation' },
      { time: '12 Oct, 06:18', camera: 'Camera 04', note: 'Resting near waterhole' },
    ],
    pendingReview: true,
  },
  {
    id: 'T-08', species: 'Bengal tiger', name: 'T-08', status: 'verified',
    lastSeen: '3 hours ago', lastCamera: 'Camera 04', zone: 'Buffer Zone',
    sightings: 24, referenceImages: 8,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Walking_tiger_female.jpg/800px-Walking_tiger_female.jpg',
    sightingHistory: [],
    pendingReview: false,
  },
  {
    id: 'T-19', species: 'Bengal tiger', name: 'T-19', status: 'verified',
    lastSeen: '5 hours ago', lastCamera: 'Camera 12', zone: 'Core Zone',
    sightings: 11, referenceImages: 4,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Walking_tiger_female.jpg/800px-Walking_tiger_female.jpg',
    sightingHistory: [],
    pendingReview: false,
  },
  {
    id: 'L-04', species: 'Indian leopard', name: 'L-04', status: 'verified',
    lastSeen: '1 day ago', lastCamera: 'Camera 03', zone: 'Core Zone',
    sightings: 7, referenceImages: 3,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Leopard_in_Yala_National_Park_01.jpg/800px-Leopard_in_Yala_National_Park_01.jpg',
    sightingHistory: [],
    pendingReview: false,
  },
  {
    id: 'L-07', species: 'Indian leopard', name: 'L-07', status: 'verified',
    lastSeen: '2 days ago', lastCamera: 'Camera 05', zone: 'Buffer Zone',
    sightings: 5, referenceImages: 2,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Leopard_in_Yala_National_Park_01.jpg/800px-Leopard_in_Yala_National_Park_01.jpg',
    sightingHistory: [],
    pendingReview: false,
  },
  {
    id: 'T-21', species: 'Bengal tiger', name: 'T-21', status: 'pending',
    lastSeen: '4 hours ago', lastCamera: 'Camera 09', zone: 'Buffer Zone',
    sightings: 3, referenceImages: 1,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Walking_tiger_female.jpg/800px-Walking_tiger_female.jpg',
    sightingHistory: [],
    pendingReview: false,
  },
];

// ---- REPORT DATA ----
export const MOCK_REPORT_SUMMARY = {
  alertsReceived: 24, missionsCompleted: 8, identityReviews: 12, alertsResolved: 18,
};

export const MOCK_REPORT_CHART = [
  { date: '09 Oct', received: 7, resolved: 5 },
  { date: '10 Oct', received: 11, resolved: 7 },
  { date: '11 Oct', received: 8, resolved: 6 },
  { date: '12 Oct', received: 9, resolved: 8 },
  { date: '13 Oct', received: 10, resolved: 7 },
  { date: '14 Oct', received: 12, resolved: 9 },
  { date: '15 Oct', received: 11, resolved: 8 },
];

export const MOCK_REPORT_STATUS = [
  { name: 'Resolved', value: 18, color: '#2d6a4f', pct: 75.0 },
  { name: 'In progress', value: 4, color: '#d97706', pct: 16.7 },
  { name: 'Needs review', value: 2, color: '#9ca3af', pct: 8.3 },
];

export const MOCK_REPORTS_ARCHIVE = [
  { id: 'R-001', name: 'Daily operations summary', type: 'Operations', period: '15 Oct 2026', author: 'Operator', status: 'ready' },
  { id: 'R-002', name: 'Drone mission outcomes', type: 'Missions', period: '09 – 15 Oct 2026', author: 'Operator', status: 'ready' },
  { id: 'R-003', name: 'Animal identity reviews', type: 'Re-ID', period: '09 – 15 Oct 2026', author: 'Reviewer', status: 'ready' },
  { id: 'R-004', name: 'Open incident follow-up', type: 'Incidents', period: '15 Oct 2026', author: 'Operator', status: 'draft' },
];

// ---- MAP ENTITIES ----
export const MOCK_MAP_CAMERAS = [
  { id: 'CAM-07', label: 'Camera 07', lat: 20.3155, lng: 79.3947, status: 'online', zone: 'Buffer Zone' },
  { id: 'CAM-12', label: 'Camera 12', lat: 20.3200, lng: 79.3900, status: 'online', zone: 'Core Zone' },
  { id: 'CAM-03', label: 'Camera 03', lat: 20.3100, lng: 79.3850, status: 'offline', zone: 'Buffer Zone' },
  { id: 'CAM-04', label: 'Camera 04', lat: 20.3300, lng: 79.4050, status: 'online', zone: 'Core Zone' },
  { id: 'CAM-09', label: 'Camera 09', lat: 20.3080, lng: 79.3920, status: 'online', zone: 'Buffer Zone' },
  { id: 'CAM-16', label: 'Camera 16', lat: 20.3250, lng: 79.4000, status: 'online', zone: 'Core Zone' },
];

export const MOCK_MAP_SIGHTINGS = [
  { id: 'SIG-001', alertId: 'ALT-024', species: 'Tiger', lat: 20.3165, lng: 79.3955, time: '10:22 AM', risk: 'high' },
  { id: 'SIG-002', alertId: 'ALT-023', species: 'Leopard', lat: 20.3210, lng: 79.3895, time: '10:06 AM', risk: 'medium' },
  { id: 'SIG-003', alertId: 'ALT-021', species: 'Tiger', lat: 20.3260, lng: 79.4008, time: '09:42 AM', risk: 'high' },
];

export const MOCK_MAP_DRONES = [
  { id: 'D-01', label: 'Drone D-01', lat: 20.3158, lng: 79.3950, battery: 78, status: 'airborne', missionId: 'MSN-024' },
  { id: 'D-02', label: 'Drone D-02', lat: 20.3105, lng: 79.3852, battery: 62, status: 'standby', missionId: 'MSN-025' },
];

// ---- OVERVIEW STATS ----
export const MOCK_OVERVIEW_STATS = {
  activeAlerts: 3,
  dronesAvailable: 2,
  registeredAnimals: 24,
  openMissions: 2,
};
