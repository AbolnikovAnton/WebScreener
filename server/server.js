const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const app = express();
const port = 3000;

app.use(cors());

// Function to search for a keyword on a page
// Function to search for a keyword on a page
async function searchKeyword(url, keyword) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);

  // Wait for the page to fully load
  await page.waitForSelector("body");

  // Scroll to the bottom of the page if necessary
  await autoScroll(page);

  // Wait for a brief moment to ensure all content is loaded
  await delay(1000);

  // Get page content
  const content = await page.content();

  // Break the content into lines
  const lines = content.split("\n");

  // An array to store strings that contain the keyword
  const linesWithKeyword = [];

  // Find the keyword in each line and add it to the array
  lines.forEach((line) => {
    line = line.trim(); // Trim whitespace from the line
    if (line.includes(keyword)) {
      // Remove HTML tags if any
      line = line.replace(/<[^>]*>?/gm, "");
      linesWithKeyword.push(line);
    }
  });

  await browser.close();

  return linesWithKeyword;
}

// Function to introduce delay
function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

// Function to automatically scroll the page to the end
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

// Route for processing requests
app.get("/", async (req, res) => {
  const url = req.query.url;
  const keyword = req.query.keyword;

  try {
    console.log("Received request with URL:", url);
    console.log("Received request with keyword:", keyword);

    // Perform a keyword search on the page
    const keywordFound = await searchKeyword(url, keyword);
    console.log("Keyword found:", keywordFound);

    res.json({ keywordFound: keywordFound }); // Отправка ответа в формате JSON
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" }); // Отправка сообщения об ошибке в формате JSON
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
