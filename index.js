const axios = require("axios");
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const FormData = require('form-data');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const temp_path = process.env.WENKU8_TEMP_PATH || `/tmp/light_novels`;
const download_path = process.env.WENKU8_DOWNLOAD_PATH || process.cwd();
const wenku8_url = `https://www.wenku8.net`;
const wenku8_login = `${wenku8_url}/login.php?do=submit`;
const wenku8_books = `${wenku8_url}/modules/article/bookcase.php`;
const wenku8_umd_url = `http://dl.wenku8.com/umd`;

axiosCookieJarSupport(axios);

const cookieJar = new tough.CookieJar();

const login = async (username, password) => {
  const form = new FormData();
  form.append('username', username);
  form.append('password', password);
  form.append('action', 'login');

  const response = await axios.post(wenku8_login, form, { headers: form.getHeaders(), jar: cookieJar, withCredentials: true });
  const data = response.data;

  return data;
}

const get_books = async () => {
  const response = await axios.get(wenku8_books, { jar: cookieJar, withCredentials: true, responseType: 'arraybuffer' });
  const dom = new JSDOM(response.data);

  const books = [];
  dom.window.document.querySelectorAll("[href*='/readbookcase.php']").forEach(link => {
    const params = new URLSearchParams(link.search);
    if (!params.has('cid')) {
      const bookId = parseInt(params.get('aid'));
      const path = Math.floor(bookId/1000);

      //const url = `/${path}/${bookId}/${bookId}.umd`;
      books.push({
        name: link.text,
        path: path,
        bookId: bookId
      });
    }
  });

  return books;
}

const download_book = async (book) => {
  try {
    const cmd = `wget -N --no-if-modified-since "${wenku8_umd_url}/${book.path}/${book.bookId}/${book.bookId}.umd"`
    //console.log(cmd)
    const { stdout, stderr } = await exec(cmd);
    //console.log(stdout);
    //console.log(stderr);
  }
  catch (e) {
    console.error(e);
  }

  try {
    const cmd = `cp -u "${book.bookId}.umd" "${download_path}/${book.name}.umd"`
    //console.log(cmd)
    const { stdout, stderr } = await exec(cmd);
    //console.log(stdout);
    //console.log(stderr);
  }
  catch (e) {
    console.error(e);
  }
}

const get_script = async () => {
  const username = process.env.WENKU8_USERNAME;
  const password = process.env.WENKU8_PASSWORD;
  console.log('Logging in...');
  const response = await login(username, password);

  const books = await get_books();
  fs.mkdirSync(temp_path, { recursive: true })
  process.chdir(temp_path);
  console.log(`Processing ${books.length} books...`);
  for (const book of books) {
    await download_book(book);
    console.log(`Downloaded ${book.name}...`);
  }

  console.log(`Finished processing ${books.length} books...`);
}

get_script();
