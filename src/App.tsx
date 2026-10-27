import { FormulaInput } from './components/FormulaInput';
import { GraphCanvas } from './components/GraphCanvas';
import { useThemeStore } from './store/themeStore';
import './App.scss';

function App() {
    // 테마를 <html> 에 반영하는 일은 themeStore 가 담당 (저장값 복원 시 · setTheme 시)
    const { theme, setTheme } = useThemeStore();

    return (
        <main className='app'>
            <FormulaInput theme={theme} setTheme={setTheme} />
            <GraphCanvas />
        </main>
    );
}

export default App;
