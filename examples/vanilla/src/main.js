import 'glorpies/element';
import './style.css';

const face = document.querySelector('glorpie-face');
document.querySelector('#name').addEventListener('input', (event) => {
  face.name = event.target.value;
  face.setAttribute('label', `An alien avatar for ${event.target.value || 'an empty name'}`);
});
document.querySelector('#look').addEventListener('change', (event) => {
  face.setAttribute('look', event.target.value);
});
