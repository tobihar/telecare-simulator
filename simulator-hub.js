(() => {
  'use strict';

  const LAUNCH_KEY = 'galenLaunchConfig';
  const PARTICIPANT_KEY = 'galenParticipant';
  const form = document.getElementById('missionForm');
  const participantInput = document.getElementById('participantInput');
  const participantError = document.getElementById('participantError');
  const identityField = participantInput.closest('.identity-field');
  const identityState = document.getElementById('identityState');
  const selectedModuleInput = document.getElementById('selectedModule');
  const moduleButtons = [...document.querySelectorAll('[data-module]')];
  const configPanel = document.getElementById('configPanel');
  const shockConfig = document.getElementById('shockConfig');
  const anesthesiaConfig = document.getElementById('anesthesiaConfig');
  const caseSelect = document.getElementById('hubCaseSelect');
  const caseMeta = document.getElementById('caseMeta');
  const launchParticipant = document.getElementById('launchParticipant');
  const launchSummary = document.getElementById('launchSummary');
  let selectedModule = '';

  const cases = Object.values(window.TELECARE_CASES || {}).filter(item => item.enabled !== false);
  cases.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.number} · ${item.shortTitle || item.title}`;
    caseSelect.append(option);
  });

  function normalizedParticipant() {
    return participantInput.value.trim().replace(/\s+/g, ' ').slice(0, 80);
  }

  function validateParticipant(showError = false) {
    const value = normalizedParticipant();
    const valid = value.length >= 2;
    identityField.classList.toggle('valid', valid);
    identityField.classList.toggle('invalid', showError && !valid);
    identityState.textContent = valid ? '✓' : 'ID';
    participantError.textContent = showError && !valid ? 'Bitte gib einen Benutzernamen mit mindestens zwei Zeichen ein.' : '';
    launchParticipant.textContent = valid ? value : 'Noch nicht angegeben';
    return valid;
  }

  function updateCaseMeta() {
    const selectedCase = cases.find(item => item.id === caseSelect.value);
    caseMeta.textContent = selectedCase ? `${selectedCase.setting} · ${selectedCase.patient?.age || '–'} Jahre · ${selectedCase.patient?.sex || 'Patient'}` : 'Szenario auswählen';
    updateLaunchSummary();
  }

  function updateLaunchSummary() {
    if (selectedModule === 'shock') {
      const selectedCase = cases.find(item => item.id === caseSelect.value);
      const difficulty = document.querySelector('[name="difficulty"]:checked')?.closest('label')?.querySelector('strong')?.textContent || 'Leicht';
      const duration = Number(document.querySelector('[name="duration"]:checked')?.value || 600) / 60;
      launchSummary.textContent = `${selectedCase?.number || 'Fall'} · ${difficulty} · ${duration} Minuten`;
    } else if (selectedModule === 'anesthesia') {
      launchSummary.textContent = 'Beatmung bei elektiver OP · PCV Sandbox · offene Laufzeit';
    } else {
      launchSummary.textContent = 'Deck auswählen und Einstellungen prüfen';
    }
  }

  function openConfig(module, shouldScroll = true) {
    selectedModule = module;
    selectedModuleInput.value = module;
    moduleButtons.forEach(button => {
      const active = button.dataset.module === module;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const anesthesia = module === 'anesthesia';
    shockConfig.hidden = anesthesia;
    anesthesiaConfig.hidden = !anesthesia;
    configPanel.classList.toggle('anesthesia-selected', anesthesia);
    document.getElementById('configKicker').textContent = anesthesia ? 'DECK 02 · EXPERIMENTAL' : 'DECK 01 · AKUTMEDIZIN';
    document.getElementById('configTitle').textContent = anesthesia ? 'Anästhesie-Simulator' : 'Schock-Simulation';
    document.getElementById('configDescription').textContent = anesthesia ? 'Übernimm eine intubierte Patientin und erkunde PCV-Beatmung und TIVA.' : 'Wähle Szenario, Schwierigkeit und Simulationsdauer.';
    configPanel.hidden = false;
    requestAnimationFrame(() => configPanel.classList.add('open'));
    updateLaunchSummary();
    if (shouldScroll) setTimeout(() => configPanel.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }

  moduleButtons.forEach(button => button.addEventListener('click', () => openConfig(button.dataset.module)));
  participantInput.addEventListener('input', () => validateParticipant(false));
  participantInput.addEventListener('blur', () => validateParticipant(participantInput.value.length > 0));
  caseSelect.addEventListener('change', updateCaseMeta);
  document.querySelectorAll('[name="difficulty"],[name="duration"]').forEach(input => input.addEventListener('change', updateLaunchSummary));
  document.getElementById('closeConfig').addEventListener('click', () => {
    configPanel.classList.remove('open');
    moduleButtons.forEach(button => {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    });
    selectedModule = '';
    selectedModuleInput.value = '';
    setTimeout(() => { configPanel.hidden = true; }, 260);
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const participantValid = validateParticipant(true);
    if (!participantValid) {
      participantInput.focus();
      participantInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!selectedModule) {
      document.getElementById('moduleTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
      moduleButtons[0]?.focus();
      return;
    }

    const username = normalizedParticipant();
    const launchConfig = {
      version: 1,
      createdAt: Date.now(),
      module: selectedModule,
      username
    };
    if (selectedModule === 'shock') {
      launchConfig.caseId = caseSelect.value;
      launchConfig.difficulty = document.querySelector('[name="difficulty"]:checked')?.value || 'easy';
      launchConfig.duration = Number(document.querySelector('[name="duration"]:checked')?.value || 600);
    }
    try {
      sessionStorage.setItem(PARTICIPANT_KEY, username);
      sessionStorage.setItem(LAUNCH_KEY, JSON.stringify(launchConfig));
    } catch {}
    window.location.href = selectedModule === 'shock' ? '/shock?launch=1' : '/vent.html?launch=1';
  });

  try {
    const previousParticipant = sessionStorage.getItem(PARTICIPANT_KEY) || '';
    if (previousParticipant.length >= 2) participantInput.value = previousParticipant.slice(0, 80);
  } catch {}
  validateParticipant(false);
  updateCaseMeta();

  const requestedModule = new URLSearchParams(window.location.search).get('module');
  if (requestedModule === 'shock' || requestedModule === 'anesthesia') openConfig(requestedModule, false);
})();
