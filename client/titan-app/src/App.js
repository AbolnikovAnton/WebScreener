import "./App.css";
import React, { useState, useEffect } from "react";

function App() {
  const [website, setWebsite] = useState("");
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource("http://localhost:3001/subscribe");
    eventSource.onmessage = (event) => {
      const newData = JSON.parse(event.data).keywordFound;
      setResult((prevData) => [...prevData, ...newData]);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleFind = () => {
    setLoading(true);
    setResult([]);
    fetch(`http://localhost:3001/?url=${website}&keyword=${keyword}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.keywordFound.length === 0) {
          setResult(["Nothing found"]);
        } else {
          setResult(data.keywordFound);
        }
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
