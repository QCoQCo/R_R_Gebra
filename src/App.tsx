import { FormulaInput } from './components/FormulaInput';
import { GraphCanvas } from './components/GraphCanvas';
import './App.scss';

function App() {
    return (
        <main className='app'>
            <FormulaInput />
            <GraphCanvas />
        </main>
    );
}

export default App;
