import "./App.css";
import React, { useState } from "react";

function App() {
  const [website, setWebsite] = useState("");
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFind = () => {
    setLoading(true);
    setResult([]);
    fetch(`http://localhost:3000/?url=${website}&keyword=${keyword}`)
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setResult(data.keywordFound);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error:", error);
        setResult([]);
        setLoading(false);
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
      {loading && <div className="spinner"></div>}
      <ul>
        {result?.map((item, index) => (
          <li key={index}>
            {item.split(keyword).map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span>{keyword}</span>}
                {part}
              </React.Fragment>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
