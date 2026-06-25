(function () {
    'use strict';

    const CONFIG = {
        gpuCost: { b200: 52560, h200: 39420, h100: 30660, a100: 21900, l40s: 14600, a10g: 10950, mi300x: 35040 },
        gpuHourly: { b200: 6.00, h200: 4.50, h100: 3.50, a100: 2.50, l40s: 1.67, a10g: 1.25, mi300x: 4.00 },
        gpusPerReplica: { 7: 1, 8: 1, 13: 1, 34: 2, 70: 4, 405: 8 },
        throughputPerReplica: { 7: 18, 8: 16, 13: 10, 34: 5, 70: 3, 405: 1 },
        cacheSavings: { chat: 0.40, agentic: 0.50, rag: 0.30, code: 0.35, batch: 0.15 },
        ttftMultiplier: { chat: 4, agentic: 5, rag: 3.5, code: 3, batch: 2 },
        co2PerGpu: 2.8,
        headroom: 1.3
    };

    const SCENARIOS = {
        support: { model: 13, gpu: 'h100', volume: 1000000, workload: 'chat', tokens: 1024 },
        code:    { model: 34, gpu: 'h200', volume: 500000, workload: 'agentic', tokens: 2048 },
        rag:     { model: 70, gpu: 'h200', volume: 500000, workload: 'rag', tokens: 1536 },
        batch:   { model: 7,  gpu: 'a100', volume: 5000000, workload: 'batch', tokens: 512 }
    };

    const state = {
        model: 70,
        gpu: 'h200',
        volume: 500000,
        workload: 'chat',
        tokens: 1024
    };

    const animations = {};

    function calculate(s) {
        var reqPerSec = s.volume / 86400;
        var tokenFactor = s.tokens / 1024;
        var effectiveRps = reqPerSec * tokenFactor;
        var throughput = CONFIG.throughputPerReplica[s.model] || 5;
        var replicas = Math.max(1, Math.ceil((effectiveRps / throughput) * CONFIG.headroom));
        var gpusPerRep = CONFIG.gpusPerReplica[s.model] || 1;
        var rrGpus = replicas * gpusPerRep;
        var savings = CONFIG.cacheSavings[s.workload] || 0.30;
        var caGpus = Math.max(gpusPerRep, rrGpus - Math.max(1, Math.floor(rrGpus * savings)));
        var gpusSaved = rrGpus - caGpus;
        var costPerGpu = CONFIG.gpuCost[s.gpu] || 30660;
        var rrCost = rrGpus * costPerGpu;
        var caCost = caGpus * costPerGpu;
        var annualSavings = rrCost - caCost;
        var ttft = CONFIG.ttftMultiplier[s.workload] || 3;
        var co2 = gpusSaved * CONFIG.co2PerGpu;
        return { rrGpus: rrGpus, caGpus: caGpus, gpusSaved: gpusSaved, rrCost: rrCost, caCost: caCost, annualSavings: annualSavings, ttft: ttft, co2: co2 };
    }

    function animateValue(el, target, opts) {
        var id = el.id || el.dataset.animId || (el.dataset.animId = 'a' + Math.random().toString(36).slice(2));
        if (animations[id]) cancelAnimationFrame(animations[id]);

        var format = opts.format || function (v) { return Math.round(v).toString(); };
        var duration = opts.duration || 800;
        var raw = el.dataset.currentValue;
        var start = raw !== undefined ? parseFloat(raw) : 0;
        var delta = target - start;
        if (Math.abs(delta) < 0.5) {
            el.textContent = format(target);
            el.dataset.currentValue = target;
            return;
        }
        var t0 = performance.now();
        function tick(now) {
            var p = Math.min((now - t0) / duration, 1);
            var ease = 1 - Math.pow(1 - p, 3);
            var val = start + delta * ease;
            el.textContent = format(val);
            el.dataset.currentValue = val;
            if (p < 1) animations[id] = requestAnimationFrame(tick);
        }
        animations[id] = requestAnimationFrame(tick);
    }

    function fmtDollar(v) {
        return '$' + Math.round(v).toLocaleString('en-US');
    }

    function fmtVolume(v) {
        if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        return Math.round(v / 1000) + 'K';
    }

    function gpuSvg(saved) {
        var fill = saved ? 'var(--color-ca-dim, #b0bec5)' : 'currentColor';
        return '<svg viewBox="0 0 36 28" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="1" y="4" width="34" height="20" rx="2" stroke="' + fill + '" stroke-width="1.2" fill="none"/>' +
            '<rect x="4" y="7" width="10" height="10" rx="1" fill="' + fill + '" opacity="0.7"/>' +
            '<rect x="16" y="7" width="6" height="3" rx="0.5" fill="' + fill + '" opacity="0.4"/>' +
            '<rect x="16" y="12" width="6" height="3" rx="0.5" fill="' + fill + '" opacity="0.4"/>' +
            '<rect x="24" y="7" width="3" height="10" rx="0.5" fill="' + fill + '" opacity="0.3"/>' +
            '<rect x="29" y="7" width="3" height="10" rx="0.5" fill="' + fill + '" opacity="0.3"/>' +
            '<line x1="8" y1="24" x2="8" y2="28" stroke="' + fill + '" stroke-width="1"/>' +
            '<line x1="28" y1="24" x2="28" y2="28" stroke="' + fill + '" stroke-width="1"/>' +
            '<line x1="8" y1="0" x2="8" y2="4" stroke="' + fill + '" stroke-width="1"/>' +
            '<line x1="28" y1="0" x2="28" y2="4" stroke="' + fill + '" stroke-width="1"/>' +
        '</svg>';
    }

    function renderGpuGrid(container, total, savedCount, isCA) {
        container.innerHTML = '';
        var cols = Math.max(4, Math.ceil(Math.sqrt(total)));
        container.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
        for (var i = 0; i < total; i++) {
            var isSaved = isCA && i >= (total - savedCount);
            var div = document.createElement('div');
            div.className = 'gpu-icon' + (isSaved ? ' gpu-icon--saved' : '');
            div.style.animationDelay = (i * 30) + 'ms';
            div.innerHTML = gpuSvg(isSaved);
            if (isSaved) {
                var badge = document.createElement('span');
                badge.className = 'gpu-saved-badge';
                badge.textContent = '✓';
                div.appendChild(badge);
            }
            container.appendChild(div);
        }
    }

    function updateOutputs(result) {
        var heroEl = document.getElementById('heroSavings');
        var statSaved = document.getElementById('statGpusSaved');
        var statSavings = document.getElementById('statAnnualSavings');
        var statTtft = document.getElementById('statTtft');
        var statCo2 = document.getElementById('statCo2');

        animateValue(heroEl, result.annualSavings, { format: fmtDollar, duration: 900 });
        animateValue(statSaved, result.gpusSaved, { format: function (v) { return Math.round(v).toString(); } });
        animateValue(statSavings, result.annualSavings, { format: fmtDollar });
        animateValue(statTtft, result.ttft, { format: function (v) { return v.toFixed(1) + 'x'; } });
        animateValue(statCo2, result.co2, { format: function (v) { return v.toFixed(1) + 't'; } });

        document.getElementById('rrGpuCount').textContent = result.rrGpus + ' GPUs';
        document.getElementById('caGpuCount').textContent = result.caGpus + ' GPUs';

        var rrCostEl = document.getElementById('rrCost');
        var caCostEl = document.getElementById('caCost');
        animateValue(rrCostEl, result.rrCost, { format: fmtDollar });
        animateValue(caCostEl, result.caCost, { format: fmtDollar });

        var rrGrid = document.getElementById('rrGpuGrid');
        var caGrid = document.getElementById('caGpuGrid');
        var maxGpus = Math.min(result.rrGpus, 64);
        var savedDisplay = Math.min(result.gpusSaved, maxGpus);
        renderGpuGrid(rrGrid, maxGpus, 0, false);
        renderGpuGrid(caGrid, maxGpus, savedDisplay, true);

        var bannerNum = document.getElementById('savingsBannerNumber');
        animateValue(bannerNum, result.gpusSaved, { format: function (v) { return Math.round(v).toString(); } });
    }

    var debounceTimer = null;
    function onInputChange() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
            var result = calculate(state);
            updateOutputs(result);
        }, 50);
    }

    function setupPills(containerId, stateKey) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.addEventListener('click', function (e) {
            var pill = e.target.closest('.calc-pill');
            if (!pill) return;
            container.querySelectorAll('.calc-pill').forEach(function (p) { p.classList.remove('active'); });
            pill.classList.add('active');
            var val = pill.dataset.value;
            state[stateKey] = isNaN(Number(val)) ? val : Number(val);
            onInputChange();
        });
    }

    function setupGpuCards() {
        var container = document.getElementById('gpuCards');
        if (!container) return;
        container.addEventListener('click', function (e) {
            var card = e.target.closest('.calc-gpu-card');
            if (!card) return;
            container.querySelectorAll('.calc-gpu-card').forEach(function (c) { c.classList.remove('active'); });
            card.classList.add('active');
            state.gpu = card.dataset.value;
            onInputChange();
        });
    }

    function setupSlider(sliderId, labelId, stateKey, formatter) {
        var slider = document.getElementById(sliderId);
        var label = document.getElementById(labelId);
        if (!slider || !label) return;
        slider.addEventListener('input', function () {
            var v = Number(slider.value);
            label.textContent = formatter(v);
            state[stateKey] = v;
            onInputChange();
        });
    }

    function setupCustomInput(inputId, stateKey, syncSliderId, syncLabelId, formatter) {
        var input = document.getElementById(inputId);
        if (!input) return;
        input.addEventListener('input', function () {
            var v = Number(input.value);
            if (isNaN(v) || v <= 0) return;
            state[stateKey] = v;
            var slider = document.getElementById(syncSliderId);
            var label = document.getElementById(syncLabelId);
            if (slider) {
                slider.value = Math.min(Math.max(v, Number(slider.min)), Number(slider.max));
            }
            if (label && formatter) {
                label.textContent = formatter(v);
            }
            onInputChange();
        });
    }

    function setupAdvancedToggle() {
        var toggle = document.getElementById('advancedToggle');
        var body = document.getElementById('advancedBody');
        var chevron = document.getElementById('toggleChevron');
        if (!toggle || !body) return;
        toggle.addEventListener('click', function () {
            var open = body.classList.toggle('open');
            if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
        });
    }

    function setupScenarios() {
        document.querySelectorAll('.scenario-card').forEach(function (card) {
            card.addEventListener('click', function () {
                var key = card.dataset.scenario;
                var sc = SCENARIOS[key];
                if (!sc) return;

                state.model = sc.model;
                state.gpu = sc.gpu;
                state.volume = sc.volume;
                state.workload = sc.workload;
                state.tokens = sc.tokens;

                var modelPills = document.getElementById('modelPills');
                modelPills.querySelectorAll('.calc-pill').forEach(function (p) {
                    p.classList.toggle('active', Number(p.dataset.value) === sc.model);
                });

                var gpuCards = document.getElementById('gpuCards');
                gpuCards.querySelectorAll('.calc-gpu-card').forEach(function (c) {
                    c.classList.toggle('active', c.dataset.value === sc.gpu);
                });

                var volSlider = document.getElementById('volumeSlider');
                volSlider.value = Math.min(sc.volume, Number(volSlider.max));
                document.getElementById('volumeLabel').textContent = fmtVolume(sc.volume);
                var volInput = document.getElementById('volumeInput');
                if (volInput) volInput.value = sc.volume;

                var workloadPills = document.getElementById('workloadPills');
                workloadPills.querySelectorAll('.calc-pill').forEach(function (p) {
                    p.classList.toggle('active', p.dataset.value === sc.workload);
                });

                var tokSlider = document.getElementById('tokensSlider');
                tokSlider.value = sc.tokens;
                document.getElementById('tokensLabel').textContent = sc.tokens.toLocaleString('en-US');
                var tokInput = document.getElementById('tokensInput');
                if (tokInput) tokInput.value = sc.tokens;

                var advBody = document.getElementById('advancedBody');
                if (!advBody.classList.contains('open')) {
                    advBody.classList.add('open');
                    var chev = document.getElementById('toggleChevron');
                    if (chev) chev.style.transform = 'rotate(180deg)';
                }

                document.getElementById('calculator').scrollIntoView({ behavior: 'smooth', block: 'start' });

                onInputChange();
            });
        });
    }

    function initScrollProgress() {
        var bar = document.getElementById('scrollProgress');
        if (!bar) return;
        window.addEventListener('scroll', function () {
            var h = document.documentElement.scrollHeight - window.innerHeight;
            var pct = h > 0 ? (window.scrollY / h) * 100 : 0;
            bar.style.width = pct + '%';
        }, { passive: true });
    }

    function initScrollReveal() {
        var els = document.querySelectorAll('.reveal');
        if (!els.length) return;
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
        els.forEach(function (el) { observer.observe(el); });
    }

    function init() {
        setupPills('modelPills', 'model');
        setupPills('workloadPills', 'workload');
        setupGpuCards();
        setupSlider('volumeSlider', 'volumeLabel', 'volume', fmtVolume);
        setupSlider('tokensSlider', 'tokensLabel', 'tokens', function (v) {
            return v.toLocaleString('en-US');
        });
        setupCustomInput('volumeInput', 'volume', 'volumeSlider', 'volumeLabel', fmtVolume);
        setupCustomInput('tokensInput', 'tokens', 'tokensSlider', 'tokensLabel', function (v) {
            return v.toLocaleString('en-US');
        });
        setupAdvancedToggle();
        setupScenarios();
        initScrollProgress();
        initScrollReveal();

        var result = calculate(state);
        updateOutputs(result);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
