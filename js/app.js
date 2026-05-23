document.addEventListener("DOMContentLoaded", async () => {
    console.log("Initializing Robot Gen Engine...");

    // 1. Download and parse the entire FRC API completely client-side
    const apiData = await window.frcParser.init();

    if (!apiData) {
        alert("Critical Error loading FRC Code references.");
        return;
    }

    // 2. Setup your dynamic tab/dropdown views using the freshly pulled definitions
    renderHardwareDropdowns();
    setupEventListeners();
});

function renderHardwareDropdowns() {
    // Dynamically retrieve all cached motor options from our parsed dataset
    const motorObjects = window.frcParser.getObjectsByCategory("motor");
    const selectEl = document.getElementById("motor-type-selector");
    
    if(!selectEl) return;

    selectEl.innerHTML = motorObjects.map(motor => 
        `<option value="${motor.name}">${motor.name} (${motor.package})</option>`
    ).join('');
}

function setupEventListeners() {
    // Handle user input updates, calculations, etc.
}