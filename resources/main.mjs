import { BenchmarkRunner } from "./benchmark-runner.mjs";
import "./benchmark-report.mjs";
import * as Statistics from "./statistics.mjs";
import { Suites } from "./tests.mjs";
import { params } from "./params.mjs";

// FIXME(camillobruni): Add base class
class MainBenchmarkClient {
    displayUnit = "score";
    iterationCount = 10;
    stepCount = null;
    suitesCount = null;
    _measuredValuesList = [];
    _finishedTestCount = 0;
    _progressCompleted = null;
    _isRunning = false;

    constructor() {
        window.addEventListener("DOMContentLoaded", () => this.prepareUI());
    }

    startBenchmark() {
        this.displayUnit = params.unit;
        this.iterationCount = params.iterationCount;
        if (params.suites.length > 0) {
            if (!Suites.enable(params.suites)) {
                const message = `Suite "${params.suites}" does not exist. No tests to run.`;
                alert(message);
                console.error(
                    message,
                    params.suites,
                    "\nValid values:",
                    Suites.map((each) => each.name)
                );
                return false;
            }
        }

        const enabledSuites = Suites.filter((suite) => !suite.disabled);
        const totalSubtestsCount = enabledSuites.reduce((testsCount, suite) => {
            return testsCount + suite.tests.length;
        }, 0);
        this.stepCount = this.iterationCount * totalSubtestsCount;
        this.suitesCount = enabledSuites.length;
        const runner = new BenchmarkRunner(Suites, this);
        runner.runMultipleIterations(this.iterationCount);
        return true;
    }

    willAddTestFrame(frame) {
        const main = document.querySelector("main");
        const style = getComputedStyle(main);
        frame.style.left = `${main.offsetLeft + parseInt(style.borderLeftWidth) + parseInt(style.paddingLeft)}px`;
        frame.style.top = `${main.offsetTop + parseInt(style.borderTopWidth) + parseInt(style.paddingTop)}px`;
    }

    willRunTest(suite, test) {
        document.getElementById("info-label").textContent = suite.name;
        document.getElementById("info-progress").textContent = `${this._finishedTestCount} / ${this.stepCount}`;
    }

    didRunTest() {
        this._finishedTestCount++;
        this._progressCompleted.style.width = `${(this._finishedTestCount * 100) / this.stepCount}%`;
    }

    didRunSuites(measuredValues) {
        this._measuredValuesList.push(measuredValues);
    }

    willStartFirstIteration() {
        this._isRunning = true;
        this._measuredValuesList = [];
        this._finishedTestCount = 0;
        this._progressCompleted = document.getElementById("progress-completed");
    }

    didFinishLastIteration() {
        console.assert(this._isRunning);
        this._isRunning = false;
        const results = this._computeResults(this._measuredValuesList, this.displayUnit);

        this._updateGaugeNeedle(results.mean);
        document.getElementById("result-number").textContent = results.formattedMean;
        if (results.formattedDelta)
            document.getElementById("confidence-number").textContent = `\u00b1 ${results.formattedDelta}`;

        this._populateDetailedResults(results.formattedValues);
        document.getElementById("results-with-statistics").textContent = results.formattedMeanAndDelta;

        if (this.displayUnit === "ms") {
            document.getElementById("show-summary").style.display = "none";
            this.showResultsDetails();
        } else
            this.showResultsSummary();
    }

    _computeResults(measuredValuesList, displayUnit) {
        function valueForUnit(measuredValues) {
            if (displayUnit === "ms")
                return measuredValues.geomean;
            return measuredValues.score;
        }

        function sigFigFromPercentDelta(percentDelta) {
            return Math.ceil(-Math.log(percentDelta) / Math.log(10)) + 3;
        }

        function toSigFigPrecision(number, sigFig) {
            const nonDecimalDigitCount = number < 1 ? 0 : Math.floor(Math.log(number) / Math.log(10)) + 1;
            return number.toPrecision(Math.max(nonDecimalDigitCount, Math.min(6, sigFig)));
        }

        const values = measuredValuesList.map(valueForUnit);
        const sum = values.reduce((a, b) => {
            return a + b;
        }, 0);
        const arithmeticMean = sum / values.length;
        let meanSigFig = 4;
        let formattedDelta;
        let formattedPercentDelta;
        const delta = Statistics.confidenceIntervalDelta(0.95, values.length, sum, Statistics.squareSum(values));
        if (!isNaN(delta)) {
            const percentDelta = (delta * 100) / arithmeticMean;
            meanSigFig = sigFigFromPercentDelta(percentDelta);
            formattedDelta = toSigFigPrecision(delta, 2);
            formattedPercentDelta = `${toSigFigPrecision(percentDelta, 2)}%`;
        }

        const formattedMean = toSigFigPrecision(arithmeticMean, Math.max(meanSigFig, 3));

        return {
            formattedValues: values.map((value) => {
                return `${toSigFigPrecision(value, 4)} ${displayUnit}`;
            }),
            mean: arithmeticMean,
            formattedMean: formattedMean,
            formattedDelta: formattedDelta,
            formattedMeanAndDelta: formattedMean + (formattedDelta ? ` \xb1 ${formattedDelta} (${formattedPercentDelta})` : ""),
        };
    }

    _addDetailedResultsRow(table, iterationNumber, value) {
        const row = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = `Iteration ${iterationNumber + 1}`;
        const td = document.createElement("td");
        td.textContent = value;
        row.appendChild(th);
        row.appendChild(td);
        table.appendChild(row);
    }

    _updateGaugeNeedle(score) {
        const needleAngle = Math.max(0, Math.min(score, 140)) - 70;
        const needleRotationValue = `rotate(${needleAngle}deg)`;

        const gaugeNeedleElement = document.querySelector("#summarized-results > .gauge .needle");
        gaugeNeedleElement.style.setProperty("-webkit-transform", needleRotationValue);
        gaugeNeedleElement.style.setProperty("-moz-transform", needleRotationValue);
        gaugeNeedleElement.style.setProperty("-ms-transform", needleRotationValue);
        gaugeNeedleElement.style.setProperty("transform", needleRotationValue);
    }

    _populateDetailedResults(formattedValues) {
        const resultsTables = document.querySelectorAll(".results-table");
        let i = 0;
        resultsTables[0].innerHTML = "";
        for (; i < Math.ceil(formattedValues.length / 2); i++)
            this._addDetailedResultsRow(resultsTables[0], i, formattedValues[i]);
        resultsTables[1].innerHTML = "";
        for (; i < formattedValues.length; i++)
            this._addDetailedResultsRow(resultsTables[1], i, formattedValues[i]);

        const jsonData = JSON.stringify(this._measuredValuesList);
        const blob = new Blob([jsonData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.getElementById("download-json");
        link.href = url;
        link.setAttribute("download", `speedometer_3-${new Date().toISOString()}.json`);
    }

    prepareUI() {
        window.addEventListener("popstate", this._popStateHandler.bind(this), false);
        window.addEventListener("resize", this._resizeScreeHandler.bind(this));
        this._resizeScreeHandler();

        document.getElementById("logo").onclick = this._logoClickHandler.bind(this);
        document.getElementById("show-summary").onclick = this.showResultsSummary.bind(this);
        document.getElementById("show-details").onclick = this.showResultsDetails.bind(this);
        document.getElementById("copy-json").onclick = this.copyJsonResults.bind(this);
        document.querySelectorAll(".show-about").forEach((each) => {
            each.onclick = this.showAbout.bind(this);
        });
        document.querySelectorAll(".start-tests-button").forEach((button) => {
            button.onclick = this._startBenchmarkHandler.bind(this);
        });

        if (params.startAutomatically)
            this._startBenchmarkHandler();
    }

    _popStateHandler(event) {
        if (event.state) {
            const sectionToShow = event.state.section;
            if (sectionToShow) {
                const sections = document.querySelectorAll("main > section");
                for (let i = 0; i < sections.length; i++) {
                    if (sections[i].id === sectionToShow)
                        return this._showSection(sectionToShow, false);
                }
            }
        }
        return this._showSection("home", false);
    }

    _resizeScreeHandler() {
        // FIXME: Detect when the window size changes during the test.
        const mainSize = document.querySelector("main").getBoundingClientRect();
        const screenIsTooSmall = window.innerWidth < mainSize.width || window.innerHeight < mainSize.height;
        document.getElementById("min-screen-width").textContent = `${params.viewport.width + 50}px`;
        document.getElementById("min-screen-height").textContent = `${params.viewport.height + 50}px`;
        document.getElementById("screen-size").textContent = `${window.innerWidth}px by ${window.innerHeight}px`;
        document.getElementById("screen-size-warning").style.display = screenIsTooSmall ? null : "none";
    }

    _startBenchmarkHandler() {
        if (this.startBenchmark())
            this._showSection("running");
    }

    _logoClickHandler(event) {
        // Prevent any accidental UI changes during benchmark runs.
        if (!this._isRunning)
            this._showSection("home", true);
        event.preventDefault();
        return false;
    }

    showResultsSummary() {
        this._showSection("summarized-results", true);
    }

    showResultsDetails() {
        this._showSection("detailed-results", true);
    }

    showAbout() {
        this._showSection("about", true);
    }

    _getFormattedJSONResult() {
        const indent = "    ";
        return JSON.stringify(this._measuredValuesList, undefined, indent);
    }

    copyJsonResults() {
        navigator.clipboard.writeText(this._getFormattedJSONResult());
    }

    downloadJsonResults() {
        navigator.clipboard.writeText(this._getFormattedJSONResult());
    }

    _showSection(sectionIdentifier, pushState) {
        const currentSectionElement = document.querySelector("section.selected");
        console.assert(currentSectionElement);

        const newSectionElement = document.getElementById(sectionIdentifier);
        console.assert(newSectionElement);

        currentSectionElement.classList.remove("selected");
        newSectionElement.classList.add("selected");

        if (pushState)
            history.pushState({ section: sectionIdentifier }, document.title);
    }
}

const rootStyle = document.documentElement.style;
rootStyle.setProperty("--viewport-width", `${params.viewport.width}px`);
rootStyle.setProperty("--viewport-height", `${params.viewport.height}px`);

globalThis.benchmarkClient = new MainBenchmarkClient();
