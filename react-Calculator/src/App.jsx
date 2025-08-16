import React, { useRef, useState } from "react";
import "./App.css";

function App() {
  const inputRef = useRef(null);     // Reference to the number input
  const resultRef = useRef(null);    // Optional: where we display the result
  const [result, setResult] = useState(0);

  // Safely parse the current input into a number
  const getInputValue = () => {
    const val = Number(inputRef.current?.value);
    return Number.isNaN(val) ? 0 : val;
  };

  // Addition (already provided idea)
  const plus = (e) => {
    e.preventDefault();
    setResult((prev) => prev + getInputValue());
    inputRef.current.value = "";
    inputRef.current.focus();
  };

  // Subtraction
  const minus = (e) => {
    e.preventDefault();
    setResult((prev) => prev - getInputValue());
    inputRef.current.value = "";
    inputRef.current.focus();
  };

  // Multiplication
  const times = (e) => {
    e.preventDefault();
    setResult((prev) => prev * getInputValue());
    inputRef.current.value = "";
    inputRef.current.focus();
  };

  // Division (with divide-by-zero guard)
  const divide = (e) => {
    e.preventDefault();
    const value = getInputValue();
    if (value === 0) {
      alert("Cannot divide by zero.");
      return;
    }
    setResult((prev) => prev / value);
    inputRef.current.value = "";
    inputRef.current.focus();
  };

  // Reset only the input
  const resetInput = (e) => {
    e.preventDefault();
    inputRef.current.value = "";
    inputRef.current.focus();
  };

  // Reset the result to 0
  const resetResult = (e) => {
    e.preventDefault();
    setResult(0);
    resultRef.current?.focus?.(); // optional, keeps assignment’s ref in use
  };

  return (
    <div className="app">
      <h1>React Calculator</h1>

      <div
        className="result"
        tabIndex={-1}
        ref={resultRef}
        aria-live="polite"
        aria-atomic="true"
      >
        Result: {result}
      </div>

      <div className="controls">
        <input
          ref={inputRef}
          type="number"
          step="any"
          placeholder="Enter a number"
          aria-label="Number to calculate with"
        />

        <button className="operator" onClick={plus} aria-label="Add">
          +
        </button>
        <button className="operator" onClick={minus} aria-label="Subtract">
          −
        </button>
        <button className="operator" onClick={times} aria-label="Multiply">
          ×
        </button>
        <button className="operator" onClick={divide} aria-label="Divide">
          ÷
        </button>
      </div>

      <div className="divider" />

      <div className="controls">
        <button onClick={resetInput}>Reset Input</button>
        <button onClick={resetResult}>Reset Result</button>
      </div>
    </div>
  );
}

export default App;
