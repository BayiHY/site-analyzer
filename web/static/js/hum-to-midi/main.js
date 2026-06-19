// ========== 主程序 ==========
let audioContext, analyser, stream;
let pitchDetector;
let isRecording = false;
let recordedNotes = [];
let currentNoteStart = null;
let lastDetectedNote = null;
let lastDetectedMidi = null;
let animationId = null;
let inputMode = 'mic'; // 'mic' | 'system' | 'midi'

// MIDI 相关
let midiAccess = null;
let midiInput = null;
let midiNotesOn = new Map(); // noteNumber -> startTime
let recordStartTime = null;

// 和弦检测
let pendingNotes = []; // 待处理的音符队列
let chordDetectionTimer = null; // 和弦检测定时器
let keyboardNotesOn = new Map(); // noteNumber -> {startTime, noteName} 虚拟键盘按下的音符

const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const playBtn = document.getElementById('playBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const currentNoteEl = document.getElementById('currentNote');
const currentFreqEl = document.getElementById('currentFreq');
const notesList = document.getElementById('notesList');
const notesCard = document.getElementById('notesCard');
