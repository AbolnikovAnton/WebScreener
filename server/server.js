const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const app = express();
const port = 3001;

app.use(cors());

// Function to search for a keyword on a page
async function searchKeyword(url, keyword) {
  const browser = await puppeteer.launch({ protocolTimeout: 60000 });
  const page = await browser.newPage();
  await page.goto(url);

  // Wait for the page to fully load
  await page.waitForSelector("body");

  let keywordFound = [];
  console.log(keywordFound);

  let oldHeight;

  while (true) {
    // Get the current scroll height
    const newHeight = await page.evaluate(() => document.body.scrollHeight);

    // Scroll to the bottom of the page
    await autoScroll(page);

    // If scroll height hasn't changed, it means we've reached the end of the content
    if (newHeight === oldHeight) break;

    // Get page content
    const content = await page.content();

    // Break the content into lines
    const lines = content.split("\n");

    // Find the keyword in each line and add it to the array
    const foundKeywords = lines
      .filter((line) => {
        const trimmedLine = line.trim();
        return trimmedLine.includes(keyword);
      })
      .map((line) => line.replace(/<[^>]*>?/gm, ""));

    console.log("Sending keywords to client:", foundKeywords);

    keywordFound = keywordFound.concat(foundKeywords);

    // Update the old height for the next iteration
    oldHeight = newHeight;

    // Wait for a brief moment to ensure all content is loaded
    await delay(1000);
  }

  await browser.close();

  return keywordFound;
}

// Function to introduce delay
function delay(time) {
  return new Promise((resolve) => {
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
      }, 10);
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

    res.json({ keywordFound }); // Sending final results in JSON format
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" }); // Sending error message in JSON format
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
