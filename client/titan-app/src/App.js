import "./App.css";
import { useState } from "react";

function App() {
  const [website, setWebsite] = useState("");
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState([]);

  const handleFind = () => {
    // Отправка запроса на сервер
    fetch(`http://localhost:3000/?url=${website}&keyword=${keyword}`)
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setResult(data.keywordFound);
      })
      .catch((error) => {
        console.error("Error:", error);
        setResult([]);
      });
  };

  return (
    <div className="App">
      <header>
        <h2>TITAN Searching App</h2>
      </header>
      <div>
        <div className="website">
          <h3>Please enter your website</h3>
          <input
            value={website}
            placeholder="Website link"
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <div className="keyword">
          <h3>Please enter your keyword</h3>
          <input
            value={keyword}
            placeholder="Keyword"
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <button onClick={handleFind}>Find</button>
      </div>
      <ul>
        {result?.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;
