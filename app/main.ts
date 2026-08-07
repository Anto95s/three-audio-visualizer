import Home from './pages/Home/Home';
import routes from './routes';

const app = document.querySelector('#app');

document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-link]');

    if (target) {
        e.preventDefault();
        history.pushState({}, '', target.getAttribute('href')!);
        render();
    }
});

const render = () => {
    const page = routes[window.location.pathname] ?? Home;

    app!.innerHTML = page.render();
    page.init?.();
};

window.addEventListener('popstate', render);

render();