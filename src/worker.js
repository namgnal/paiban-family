import { advise } from './advisor.js';
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, result: advise(data.state, { refined: false }), final: false });
    self.postMessage({ id: data.id, result: advise(data.state), final: true });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message, final: true });
  }
};
