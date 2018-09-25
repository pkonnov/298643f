// tslint:disable:max-line-length

import { AsyncTest, Expect, FunctionSpy, RestorableFunctionSpy, Setup, SetupFixture, SpyOn, Teardown, Test } from 'alsatian';
import * as vm from 'vm';
import { AppStatus } from '../../../src/definition/AppStatus';
import { AppMethod } from '../../../src/definition/metadata';
import { TestsAppBridges } from '../../test-data/bridges/appBridges';
import { TestsAppLogStorage } from '../../test-data/logStorage';
import { TestData } from '../../test-data/utilities';

import { RequestMethod } from '../../../src/definition/accessors';
import { IApi, IApiRequest } from '../../../src/definition/api';
import { AppManager } from '../../../src/server/AppManager';
import { AppBridges } from '../../../src/server/bridges';
import { PathAlreadyExistsError } from '../../../src/server/errors';
import { AppConsole } from '../../../src/server/logging';
import { AppAccessorManager, AppApiManager, AppSlashCommandManager } from '../../../src/server/managers';
import { AppApi } from '../../../src/server/managers/AppApi';
import { ProxiedApp } from '../../../src/server/ProxiedApp';
import { AppLogStorage } from '../../../src/server/storage';

export class AppApiManagerTestFixture {
    public static doThrow: boolean = false;
    private mockBridges: TestsAppBridges;
    private mockApp: ProxiedApp;
    private mockAccessors: AppAccessorManager;
    private mockManager: AppManager;
    private spies: Array<RestorableFunctionSpy>;

    @SetupFixture
    public setupFixture() {
        this.mockBridges = new TestsAppBridges();

        this.mockApp = {
            getID() {
                return 'testing';
            },
            getStatus() {
                return AppStatus.AUTO_ENABLED;
            },
            hasMethod(method: AppMethod): boolean {
                return true;
            },
            makeContext(data: object): vm.Context {
                return {} as vm.Context;
            },
            runInContext(codeToRun: string, context: vm.Context): any {
                return AppApiManagerTestFixture.doThrow ?
                    Promise.reject('You told me so') : Promise.resolve();
            },
            setupLogger(method: AppMethod): AppConsole {
                return new AppConsole(method);
            },
        } as ProxiedApp;

        const bri = this.mockBridges;
        const app = this.mockApp;
        this.mockManager = {
            getBridges(): AppBridges {
                return bri;
            },
            getCommandManager() {
                return {} as AppSlashCommandManager;
            },
            getApiManager() {
                return {} as AppApiManager;
            },
            getOneById(appId: string): ProxiedApp {
                return appId === 'failMePlease' ? undefined : app;
            },
            getLogStorage(): AppLogStorage {
                return new TestsAppLogStorage();
            },
        } as AppManager;

        this.mockAccessors = new AppAccessorManager(this.mockManager);
        const ac = this.mockAccessors;
        this.mockManager.getAccessorManager = function _getAccessorManager(): AppAccessorManager {
            return ac;
        };
    }

    @Setup
    public setup() {
        this.mockBridges = new TestsAppBridges();
        const bri = this.mockBridges;
        this.mockManager.getBridges = function _refreshedGetBridges(): AppBridges {
            return bri;
        };

        this.spies = new Array<RestorableFunctionSpy>();
        this.spies.push(SpyOn(this.mockBridges.getApiBridge(), 'registerApi'));
        this.spies.push(SpyOn(this.mockBridges.getApiBridge(), 'unregisterApis'));
    }

    @Teardown
    public teardown() {
        this.spies.forEach((s) => s.restore());
    }

    @Test()
    public basicAppApiManager() {
        Expect(() => new AppApiManager({} as AppManager)).toThrow();
        Expect(() => new AppApiManager(this.mockManager)).not.toThrow();

        const ascm = new AppApiManager(this.mockManager);
        Expect((ascm as any).manager).toBe(this.mockManager);
        Expect((ascm as any).bridge).toBe(this.mockBridges.getApiBridge());
        Expect((ascm as any).accessors).toBe(this.mockManager.getAccessorManager());
        Expect((ascm as any).providedApis).toBeDefined();
        Expect((ascm as any).providedApis.size).toBe(0);
    }

    @Test()
    public registerApi() {
        const ascm = new AppApiManager(this.mockManager);

        const api: IApi = TestData.getApi('path');
        const regInfo = new AppApi(this.mockApp, api, api.endpoints[0]);

        Expect(() => (ascm as any).registerApi('testing', regInfo)).not.toThrow();
        Expect(this.mockBridges.getApiBridge().registerApi).toHaveBeenCalledWith(regInfo, 'testing');
    }

    @Test()
    public addApi() {
        const api = TestData.getApi('apipath');
        const ascm = new AppApiManager(this.mockManager);

        Expect(() => ascm.addApi('testing', api)).not.toThrow();
        Expect(this.mockBridges.getApiBridge().apis.size).toBe(1);
        Expect((ascm as any).providedApis.size).toBe(1);
        Expect((ascm as any).providedApis.get('testing').get('apipath').api).toBe(api);

        Expect(() => ascm.addApi('testing', api)).toThrowError(PathAlreadyExistsError, 'The api path "apipath" already exists in the system.');

        Expect(() => ascm.addApi('failMePlease', TestData.getApi('yet-another'))).toThrowError(Error, 'App must exist in order for an api to be added.');
        Expect(() => ascm.addApi('testing', TestData.getApi('another-api'))).not.toThrow();
        Expect((ascm as any).providedApis.size).toBe(1);
        Expect((ascm as any).providedApis.get('testing').size).toBe(2);
    }

    @Test()
    public registerApis() {
        const ascm = new AppApiManager(this.mockManager);

        SpyOn(ascm, 'registerApi');

        ascm.addApi('testing', TestData.getApi('apipath'));
        const regInfo = (ascm as any).providedApis.get('testing').get('apipath') as AppApi;

        Expect(() => ascm.registerApis('non-existant')).not.toThrow();
        Expect(() => ascm.registerApis('testing')).not.toThrow();
        Expect((ascm as any).registerApi as FunctionSpy).toHaveBeenCalledWith('testing', regInfo).exactly(1);
        Expect(this.mockBridges.getApiBridge().registerApi).toHaveBeenCalledWith(regInfo, 'testing').exactly(1);
    }

    @Test()
    public unregisterApis() {
        const ascm = new AppApiManager(this.mockManager);

        ascm.addApi('testing', TestData.getApi('apipath'));

        Expect(() => ascm.unregisterApis('non-existant')).not.toThrow();
        Expect(() => ascm.unregisterApis('testing')).not.toThrow();
        Expect(this.mockBridges.getApiBridge().unregisterApis).toHaveBeenCalled().exactly(1);
    }

    @AsyncTest()
    public async executeApis() {
        const ascm = new AppApiManager(this.mockManager);
        ascm.addApi('testing', TestData.getApi('api1'));
        ascm.addApi('testing', TestData.getApi('api2'));
        ascm.addApi('testing', TestData.getApi('api3'));
        ascm.registerApis('testing');

        SpyOn(this.mockApp, 'runInContext');
        const request: IApiRequest = {
            method: RequestMethod.GET,
            headers: {},
            query: {},
            params: {},
            content: '',
        };

        await Expect(async () => await ascm.executeApi('testing', 'nope', request)).not.toThrowAsync();
        await Expect(async () => await ascm.executeApi('testing', 'not-exists', request)).not.toThrowAsync();
        await Expect(async () => await ascm.executeApi('testing', 'api1', request)).not.toThrowAsync();
        await Expect(async () => await ascm.executeApi('testing', 'api2', request)).not.toThrowAsync();
        await Expect(async () => await ascm.executeApi('testing', 'api3', request)).not.toThrowAsync();

        Expect(this.mockApp.runInContext).toHaveBeenCalled().exactly(3);
    }
}
