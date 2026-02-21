import { FormulaInput } from './components/FormulaInput';
import { GraphCanvas } from './components/GraphCanvas';
import { useGraphStore } from './store/graphStore';
import './App.scss';

function App() {
    const { error } = useGraphStore();

    return (
        <main className='app'>
            <h1>R_R_Gebra</h1>
            <GraphCanvas />
            {error && <p className='error'>{error}</p>}
            <FormulaInput />
        </main>
    );
}

export default App;
