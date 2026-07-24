import { L as registerPlugin } from "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./vue-core-DdLVj9yW.js";
const EVENT_FETCH = "fetch";
const TAG = "BackgroundFetch";
const STATUS_RESTRICTED = 0;
const STATUS_DENIED = 1;
const STATUS_AVAILABLE = 2;
const NETWORK_TYPE_NONE = 0;
const NETWORK_TYPE_ANY = 1;
const NETWORK_TYPE_UNMETERED = 2;
const NETWORK_TYPE_NOT_ROAMING = 3;
const NETWORK_TYPE_CELLULAR = 4;
const NativeModule = registerPlugin("BackgroundFetch");
let subscriber = null;
class BackgroundFetch {
  /**
  * Background fetch updates are unavailable and the user cannot enable them again. For example, this status can occur when parental controls are in effect for the current user.
  */
  static get STATUS_RESTRICTED() {
    return STATUS_RESTRICTED;
  }
  /**
  * The user explicitly disabled background behavior for this app or for the whole system.
  */
  static get STATUS_DENIED() {
    return STATUS_DENIED;
  }
  /**
  * Background fetch is available and enabled.
  */
  static get STATUS_AVAILABLE() {
    return STATUS_AVAILABLE;
  }
  /**
  * This job doesn't care about network constraints, either any or none.
  */
  static get NETWORK_TYPE_NONE() {
    return NETWORK_TYPE_NONE;
  }
  /**
  * This job requires network connectivity.
  */
  static get NETWORK_TYPE_ANY() {
    return NETWORK_TYPE_ANY;
  }
  /**
  * This job requires network connectivity that is a cellular network.
  */
  static get NETWORK_TYPE_CELLULAR() {
    return NETWORK_TYPE_CELLULAR;
  }
  /**
  * This job requires network connectivity that is unmetered.
  */
  static get NETWORK_TYPE_UNMETERED() {
    return NETWORK_TYPE_UNMETERED;
  }
  /**
  * This job requires network connectivity that is not roaming.
  */
  static get NETWORK_TYPE_NOT_ROAMING() {
    return NETWORK_TYPE_NOT_ROAMING;
  }
  /**
  * Initial configuration of BackgroundFetch, including config-options and Fetch-callback.  The [[start]] method will automatically be executed.
  *
  * ```javascript
  *   async initBackgroundFetch() {
  *     const status = await BackgroundFetch.configure({
  *       minimumFetchInterval: 15
  *     }, async (taskId) => {  // <---------------- Event handler.
  *       console.log('[BackgroundFetch] EVENT:', taskId);
  *       // Perform your work in an awaited Promise
  *       const result = await this.performYourWorkHere();
  *       console.log('[BackgroundFetch] work complete:', result);
  *       // [REQUIRED] Signal to the OS that your work is complete.
  *       BackgroundFetch.finish(taskId);
  *     }, async (taskId) => {  // <---------------- Event timeout handler
  *       // The OS has signalled that your remaining background-time has expired.
  *       // You must immediately complete your work and signal #finish.
  *       console.log('[BackgroundFetch] TIMEOUT:', taskId);
  *       // [REQUIRED] Signal to the OS that your work is complete.
  *       BackgroundFetch.finish(taskId);
  *     });
  *
  *     // Checking BackgroundFetch status:
  *     if (status !== BackgroundFetch.STATUS_AVAILABLE) {
  *       // Uh-oh:  we have a problem:
  *       if (status === BackgroundFetch.STATUS_DENIED) {
  *         alert('The user explicitly disabled background behavior for this app or for the whole system.');
  *       } else if (status === BackgroundFetch.STATUS_RESTRICTED) {
  *         alert('Background updates are unavailable and the user cannot enable them again.')
  *       }
  *     }
  *   }
  *
  *   // Simulate a long-running task (eg:  an HTTP request)
  *   async performYourWorkHere() {
  *     return new Promise((resolve, reject) => {
  *       setTimeout(() => {
  *         resolve(true);
  *       }, 5000);
  *     });
  *   }
  * }
  * ```
  */
  static configure(config, onEvent, onTimeout) {
    if (typeof onEvent !== "function") {
      throw "BackgroundFetch requires an event callback at 2nd argument";
    }
    if (typeof onTimeout !== "function") {
      console.warn("[BackgroundFetch] configure:  You did not provide a 3rd argument onTimeout callback.  This callback is a signal from the OS that your allowed background time is about to expire.  Use this callback to finish what you're doing and immediately call BackgroundFetch.finish(taskId)");
      onTimeout = (taskId) => {
        console.warn("[BackgroundFetch] default onTimeout callback fired.  You should provide your own onTimeout callbcak to .configure(options, onEvent, onTimeout)");
        BackgroundFetch.finish(taskId);
      };
    }
    const myOnTimeout = onTimeout;
    if (subscriber !== null) {
      subscriber.remove();
      subscriber = null;
    }
    subscriber = NativeModule.addListener(EVENT_FETCH, (event) => {
      if (!event.timeout) {
        onEvent(event.taskId);
      } else {
        myOnTimeout(event.taskId);
      }
    });
    config = config || {};
    return new Promise((resolve, reject) => {
      NativeModule.configure({ options: config }).then((result) => {
        resolve(result.status);
      }).catch((error) => {
        console.warn(TAG, "ERROR:", error);
        reject(error.message);
      });
    });
  }
  /**
  * Execute a custom task in addition to the one initially provided to [[configure]].
  * This event can be configured to either a "ONE-SHOT" or "PERIODIC" with [[TaskConfig.periodic]].
  *
  * ```javascript
  * // You must ALWAYS first configure BackgroundFetch.
  * const status = await BackgroundFetch.configure({
  *   minimumFetchInterval: 15
  * }, async (taskId) => {
  *   console.log('[BackgroundFetch] EVENT', taskId);
  *   if (taskId === 'my-custom-task') {
  *     console.log('Handle your custom-task here');
  *   } else {
  *     console.log('This is the default, periodic fetch task');
  *   }
  *   // Always signal completion of your tasks.
  *   BackgroundFetch.finish(taskId);
  * }, async (taskId) => {
  *   console.log('[BackgroundFetch] TIMEOUT', taskId);
  *   if (taskId === 'my-custom-task') {
  *     console.log('My custom task timed-out');
  *   } else {
  *     console.log('The default, periodic fetch task timed-out');
  *   }
  *   BackgroundFetch.finish(taskId);
  * });
  *
  * // Execute an additional custom-task.
  * BackgroundFetch.scheduleTask({
  *   taskId: 'my-custom-task',  // <-- REQUIRED
  *   delay: 10000,              // <-- REQUIRED
  *   periodic: false            // <-- ONE-SHOT (default)
  * })
  * ```
  */
  static scheduleTask(config) {
    return new Promise((resolve, reject) => {
      if (typeof config.delay !== "number") {
        const delay = parseInt(config.delay, 10);
        if (delay === NaN) {
          reject("[BackgroundFetch] TaskConfig.delay must be a number: " + config.delay);
          return;
        }
        config.delay = delay;
      }
      return NativeModule.scheduleTask({ options: config }).then(() => {
        resolve();
      }).catch((error) => {
        reject(error.message);
      });
    });
  }
  /**
  * Start subscribing to fetch events.
  *
  * __Note:__ The inital call to [[configure]] *automatically* calls __`BackgroundFetch.start()`__
  *
  * ```javascript
  *   async initBackgroundFetch() {
  *     // Calling .configure() automatically starts the plugin.
  *     const status = await BackgroundFetch.configure({
  *       minimumFetchInterval: 15
  *     }, async (taskId) => {  // <---------------- Event handler.
  *       console.log('[BackgroundFetch] EVENT:', taskId);
  *       BackgroundFetch.finish(taskId);
  *     }, async (taskId) => {  // <---------------- Event timeout handler
  *       console.log('[BackgroundFetch] TIMEOUT:', taskId);
  *       // [REQUIRED] Signal to the OS that your work is complete.
  *       BackgroundFetch.finish(taskId);
  *     });
  *   }
  *
  *   // Stop BackgroundFetch
  *   onClickStop() {
  *     BackgroundFetch.stop();
  *   }
  *
  *   // Re-start BackgroundFetch
  *   onClickStart() {
  *     BackgroundFetch.start();
  *   }
  *
  * ```
  */
  static start() {
    return new Promise((resolve, reject) => {
      NativeModule.start().then((result) => {
        resolve(result.status);
      }).catch((error) => {
        reject(error.message);
      });
    });
  }
  /**
  * Stop subscribing to fetch events.
  *
  * ```javascript
  * // Stop everything.
  * BackgroundFetch.stop();
  * ```
  *
  * You may also provide an optional __`taskId`__ to stop a [[scheduleTask]]:
  *
  * ```javascript
  * // Stop a particular task scheduled with BackgroundFetch.scheduleTask
  * await BackgroundFetch.scheduleTask({
  *   taskId: 'my-custom-task',
  *   delay: 10000,
  *   periodic: false
  * });
  * .
  * .
  * .
  * BackgroundFetch.stop('my-custom-task');
  * ```
  */
  static stop(taskId) {
    return new Promise((resolve, reject) => {
      NativeModule.stop({ taskId }).then(() => {
        resolve();
      }).catch((error) => {
        reject(error.message);
      });
    });
  }
  /**
  * You must execute `BackgroundFetch.finish(taskId)` within your fetch-callback to signal completion of your task.
  *
  * If you *fail* to call `.finish()`, the OS __will punish your app for poor behaviour and stop firing events__.
  *
  * ```javascript
  * await BackgroundFetch.configure({
  *   minimumFetchInterval: 15
  * }, async (taskId) => {
  *   console.log('[BackgroundFetch] EVENT', taskId);
  *   // Always signal completion of your tasks.
  *   BackgroundFetch.finish(taskId);
  * }, async (taskId) => {
  *   console.log('[BackgroundFetch] TIMEOUT', taskId);
  *   // Always signal completion of your tasks.
  *   BackgroundFetch.finish(taskId);
  * });
  * ```
  */
  static finish(taskId) {
    return NativeModule.finish({ taskId });
  }
  /**
  * Query the BackgroundFetch API status
  *
  * ```javascript
  * // Checking BackgroundFetch status:
  * const status = await BackgroundFetch.status();
  *
  * if (status !== BackgroundFetch.STATUS_AVAILABLE) {
  *   // Uh-oh:  we have a problem:
  *   if (status === BackgroundFetch.STATUS_DENIED) {
  *     alert('The user explicitly disabled background behavior for this app or for the whole system.');
  *   } else if (status === BackgroundFetch.STATUS_RESTRICTED) {
  *     alert('Background updates are unavailable and the user cannot enable them again.')
  *   }
  * }
  * ```
  *
  * | BackgroundFetchStatus              | Description                                     |
  * |------------------------------------|-------------------------------------------------|
  * | `BackgroundFetch.STATUS_RESTRICTED`  | Background fetch updates are unavailable and the user cannot enable them again. For example, this status can occur when parental controls are in effect for the current user. |
  * | `BackgroundFetch.STATUS_DENIED`      | The user explicitly disabled background behavior for this app or for the whole system. |
  * | `BackgroundFetch.STATUS_AVAILABLE`   | Background fetch is available and enabled.      |
  */
  static status() {
    return new Promise((resolve, reject) => {
      NativeModule.status().then((result) => {
        resolve(result.status);
      }).catch((error) => {
        reject(error.message);
      });
    });
  }
}
export {
  BackgroundFetch
};
