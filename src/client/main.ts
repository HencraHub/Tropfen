import { runProbe } from './probe';

const params = new URLSearchParams(location.search);
const gl = document.getElementById('gl') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLCanvasElement;

if (params.get('probe')) {
  runProbe(gl, ui, params);
} else {
  import('./app').then((m) => m.startApp(gl, ui, params));
}
