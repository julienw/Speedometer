import { BenchmarkRunner } from "../resources/benchmark-runner.mjs";
import { defaultParams } from "../resources/params.mjs";

function TEST_FIXTURE(name) {
    return {
        name,
        run: sinon.stub(),
    };
}

const SUITES_FIXTURE = [
    {
        name: "Suite 1",
        tests: [TEST_FIXTURE("Test 1"), TEST_FIXTURE("Test 2"), TEST_FIXTURE("Test 3")],
    },
    {
        name: "Suite 2",
        tests: [TEST_FIXTURE("Test 1")],
    },
];

const CLIENT_FIXTURE = {
    willRunTest: sinon.stub(),
    didRunTest: sinon.stub(),
    didRunSuites: sinon.stub(),
};

function stubPerformanceNowCalls(syncStart, syncEnd, asyncStart, asyncEnd) {
    sinon
        .stub(window.performance, "now")
        .onFirstCall()
        .returns(syncStart) // startTime (sync)
        .onSecondCall()
        .returns(syncEnd) // endTime (sync)
        .onThirdCall()
        .returns(asyncStart) // startTime (async)
        .returns(asyncEnd); // endTime (async)
}

describe("BenchmarkRunner", () => {
    const { spy, stub, assert } = sinon;
    let runner;

    before(() => {
        runner = new BenchmarkRunner(SUITES_FIXTURE, CLIENT_FIXTURE);
    });

    it("should be defined", () => {
        expect(runner).not.to.be(undefined);
    });

    describe("Frame", () => {
        describe("_removeFrame", () => {
            let frame, removeChildSpy;

            before(async () => {
                frame = await runner._appendFrame();

                removeChildSpy = spy(frame.parentNode, "removeChild");
            });

            it("should remove the frame if a frame is defined", () => {
                expect(runner._frame).to.equal(frame);

                runner._removeFrame();

                assert.calledWith(removeChildSpy, frame);
                expect(runner._frame).to.equal(null);
            });
        });

        describe("_appendFrame", () => {
            const DEFAULT_WIDTH = defaultParams.viewport.width;
            const DEFAULT_HEIGHT = defaultParams.viewport.height;
            it(`should create an absolutely positioned iframe with ${DEFAULT_WIDTH}px x ${DEFAULT_WIDTH}px dimensions`, async () => {
                const createElementSpy = spy(document, "createElement");

                const frame = await runner._appendFrame();
                expect(frame).to.be.a(HTMLIFrameElement);
                assert.calledWith(createElementSpy, frame.nodeName.toLowerCase());

                const { width, height, position } = getComputedStyle(frame);

                expect(parseInt(width)).to.equal(DEFAULT_WIDTH);
                expect(parseInt(height)).to.equal(DEFAULT_HEIGHT);
                expect(position).to.be("absolute");
            });

            it("should disable scrolling in the frame", async () => {
                const { scrolling } = await runner._appendFrame();
                expect(scrolling).to.be("no");
            });

            it(`should add body margins to the frame if the window is larger than ${DEFAULT_WIDTH}px x ${DEFAULT_HEIGHT}px`, async () => {
                stub(window, "innerWidth").get(() => DEFAULT_WIDTH + 100);
                stub(window, "innerHeight").get(() => DEFAULT_HEIGHT + 100);

                const { style } = await runner._appendFrame();
                expect(style.left).to.be("8px");
                expect(style.top).to.be("8px");
            });

            it(`should not add outer spacing to the frame if the window is smaller than ${DEFAULT_WIDTH}px x ${DEFAULT_HEIGHT}px`, async () => {
                stub(window, "innerWidth").get(() => DEFAULT_WIDTH - 100);

                const { style } = await runner._appendFrame();
                expect(style.left).to.be("0px");
                expect(style.top).to.be("0px");
            });

            it("should insert the frame as the first child in the document body", async () => {
                const firstChild = document.createTextNode("First Child");
                const insertBeforeSpy = spy(document.body, "insertBefore");

                document.body.prepend(firstChild);

                const frame = await runner._appendFrame();
                assert.calledWith(insertBeforeSpy, frame, firstChild);

                document.body.removeChild(firstChild); // clean up
            });
        });
    });

    describe("Suite", () => {
        describe("_runAllSuites", () => {
            let _runSuiteStub, _finalizeStub, _removeFrameStub;

            before(async () => {
                _runSuiteStub = stub(runner, "_runSuite").callsFake(() => null);
                _finalizeStub = stub(runner, "_finalize").callsFake(() => null);
                _removeFrameStub = stub(runner, "_removeFrame").callsFake(() => null);

                await runner._runAllSuites();
            });

            it("should run all test suites", async () => {
                assert.calledTwice(_runSuiteStub);
            });

            it("should remove the previous frame and then the current frame", () => {
                assert.calledTwice(_removeFrameStub);
            });

            it("should fire the function responsible for finalizing results", () => {
                assert.calledOnce(_finalizeStub);
            });
        });

        describe("_runSuite", () => {
            let _prepareSuiteStub, _runTestAndRecordResultsStub;

            const suite = SUITES_FIXTURE[0];

            before(async () => {
                _prepareSuiteStub = stub(runner, "_prepareSuite").callsFake(() => null);

                _runTestAndRecordResultsStub = stub(runner, "_runTestAndRecordResults").callsFake(() => null);

                runner._runSuite(suite);
            });

            it("should prepare the suite first", async () => {
                assert.calledOnce(_prepareSuiteStub);
            });

            it("should run and record results for every test in suite", async () => {
                assert.calledThrice(_runTestAndRecordResultsStub);
            });
        });
    });

    describe("Test", () => {
        describe("_runTestAndRecordResults", () => {
            let _runTestSpy;

            const suite = SUITES_FIXTURE[0];

            before(async () => {
                await runner._appendFrame();

                _runTestSpy = spy(runner, "_runTest");

                await runner._runTestAndRecordResults(suite, suite.tests[0]);
            });

            it("should run the test with the correct arguments", () => {
                assert.calledWith(_runTestSpy, suite, suite.tests[0], runner._page);
            });

            it("should run client pre and post hooks if present", () => {
                assert.calledWith(runner._client.willRunTest, suite, suite.tests[0]);
                assert.calledWith(runner._client.didRunTest, suite, suite.tests[0]);
            });
        });

        describe("_runTest", () => {
            let peformanceMarkSpy, _testFnSpy, page;
            const callback = stub();
            const suite = SUITES_FIXTURE[0];

            before(async () => {
                page = { _frame: await runner._appendFrame() };
                peformanceMarkSpy = spy(window.performance, "mark");
                _testFnSpy = suite.tests[0].run.callsFake(() => null);

                stubPerformanceNowCalls(8000, 10000, 12000, 13000);
                runner._runTest(suite, suite.tests[0], page, callback);
            });

            it("should write performance marks at the start and end of the test with the correct test name", () => {
                assert.calledWith(peformanceMarkSpy, "Suite 1.Test 1-start");
                assert.calledWith(peformanceMarkSpy, "Suite 1.Test 1-sync-end");
                assert.calledWith(peformanceMarkSpy, "Suite 1.Test 1-async-end");
                assert.calledThrice(peformanceMarkSpy);
            });

            it("should run the test", () => {
                assert.calledWith(_testFnSpy, page);
            });

            it("should fire the callback with correct arguments for sync time, async time, and frame height", async () => {
                const height = runner._frame.contentDocument.body.getBoundingClientRect().height;

                await new Promise((resolve) => requestAnimationFrame(resolve));
                assert.calledWith(callback, 2000, 1000, height);
            });
        });

        describe("Finalize", () => {
            describe("_finalize", () => {
                const suite = SUITES_FIXTURE[1];

                const syncStart = 8000;
                const syncEnd = 10000;
                const asyncStart = 12000;
                const asyncEnd = 13000;

                before(async () => {
                    stub(runner, "_measuredValues").value({
                        tests: {},
                    });

                    stubPerformanceNowCalls(syncStart, syncEnd, asyncStart, asyncEnd);

                    // instantiate recorded test results
                    await runner._runTestAndRecordResults(suite, suite.tests[0]);

                    await runner._finalize();
                });

                it("should calculate measured test values correctly", () => {
                    const syncTime = syncEnd - syncStart;
                    const asyncTime = asyncEnd - asyncStart;

                    const total = syncTime + asyncTime;
                    const mean = total / suite.tests.length;
                    const geomean = Math.pow(total, 1 / suite.tests.length);
                    const score = (60 * 1000) / geomean / 3; // correctionFactor = 3

                    const { total: measuredTotal, mean: measuredMean, geomean: measuredGeomean, score: measuredScore } = runner._measuredValues;

                    expect(measuredTotal).to.equal(total);
                    expect(measuredMean).to.equal(mean);
                    expect(measuredGeomean).to.equal(geomean);
                    expect(measuredScore).to.equal(score);

                    assert.calledWith(runner._client.didRunSuites, runner._measuredValues);
                });
            });
        });
    });
});
