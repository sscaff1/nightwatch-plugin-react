const setup = require('../lib/setup.js');

let viteServer;

const isWorker = process.argv.includes('--test-worker');
const startViteServer = async function (settings = {}) {
  settings.vite_dev_server = Object.assign({
    start_vite: true,
    port: 5173
  }, settings.vite_dev_server || {});

  let vite_port;
  if (settings.vite_dev_server.start_vite) {
    viteServer = await setup();

    // This will make sure the launch Url is set correctly when mounting the React component
    settings.vite_dev_server.port = vite_port = viteServer.config.server.port;
  } else {
    vite_port = settings.vite_dev_server.port;
    const https = settings.vite_dev_server.https;
    const protocol = https ? 'https' : 'http';

    try {
      const enabled = await makeViteRequest({vite_port, protocol});

      if (!enabled) {
        const error = new Error('Missing vite-plugin-nightwatch-fixes');
        const code = `:

    import nightwatchPlugin from 'vite-plugin-nightwatch-fixes'

    export default {
      plugins: [
        // ... other plugins
        nightwatchPlugin({
          componentType: 'react'
        })
      ]
    };
    `;
        error.help = ['Please ensure that "vite-plugin-nightwatch-fixes" is loaded in your Vite config file ' + code];
        error.link = 'https://nightwatchjs.org/guide/component-testing/testing-react-components.html';

        throw error;
      }

      return true;
    } catch (err) {
      const error = new Error('Vite dev server is not running: \n   ' + err.message);
      error.help = [`You can configure Nightwatch to start Vite automatically by adding this to your nightwatch.conf.js:
        vite_dev_server: {
          start_vite: true,
          port: 5173
        }
    `];
      error.link = 'https://nightwatchjs.org/guide/component-testing/testing-react-components.html';

      throw error;
    }
  }

  this.launchUrl = this.baseUrl = `http://localhost:${vite_port}`;
};

const stopViteServer = async () => {
  if (viteServer) {
    await viteServer.close();
    viteServer = null;
  }
};

module.exports = {
  async beforeChildProcess(settings) {
    await startViteServer.call(this, settings);
  },

  async before(settings) {
    if (!settings.parallel_mode && !settings.testWorkersEnabled) {
      await startViteServer.call(this, settings);
    }
  },

  async after() {
    await stopViteServer();

    return new Promise(resolve => require('rimraf')('nightwatch/.cache', resolve));
  },

  async afterChildProcess() {
    await stopViteServer();
  }
};

function makeViteRequest({vite_port, protocol}) {
  const options = {
    host: 'localhost',
    port: vite_port,
    path: '/_nightwatch'
  };

  return new Promise((resolve, reject) => {
    const {request} = protocol === 'https' ? require('https') : require('http');
    const req = request(options, function(response) {
      if (response.statusCode === 404) {
        return resolve(false);
      }

      resolve(true);
    });

    req.on('error', err => {
      if (err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        return resolve(true);
      }

      reject(err);
    });

    req.end();
  });
}
