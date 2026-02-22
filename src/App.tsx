import { useEffect } from 'react';
import { FormulaInput } from './components/FormulaInput';
import { GraphCanvas } from './components/GraphCanvas';
import { useThemeStore, applyTheme } from './store/themeStore';
import './App.scss';

function App() {
    const { theme, setTheme } = useThemeStore();

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    return (
        <main className='app'>
            <FormulaInput theme={theme} setTheme={setTheme} />
            <GraphCanvas />
        </main>
    );
}

export default App;
