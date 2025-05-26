/**
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0/
 */

'use strict';

import { logger, database, changePanel, t } from '../utils.js';
const { Launch, Status } = require('./minecraft-java-core/build/Index.js');
const { ipcRenderer, shell } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const launch = new Launch();
const pkg = require('../package.json');
const settings_url = pkg.user ? `${pkg.settings}/${pkg.user}` : pkg.settings;

const dataDirectory =
  process.env.APPDATA ||
  (process.platform == 'darwin'
    ? `${process.env.HOME}/Library/Application Support`
    : process.env.HOME);
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

class Home {
    static id = "home";

  async init(config, news) {
    this.database = await new database().init();
    this.config = config;
    this.news = await news;

    this.setStaticTexts();
    this.initNews();
    this.initLaunch();
    this.initStatusServer();
    this.initBtn();
    this.initVideo();
    this.initAdvert();
    this.verifyModsBeforeLaunch();
  }

  setStaticTexts() {
    // document.getElementById('play-btn').textContent = t('play');
    // document.getElementById('text-download').textContent = t('verification');
    // document.getElementById('server-name').textContent = t('offline');
    // document.getElementById('server-desc').innerHTML = `<span class="red">${t('closed')}</span>`;
    // document.getElementById('video-title').textContent = t('community_video');
    // document.getElementById('play-video-btn').innerHTML = '&#9658;';
    // document.getElementById('view-video-btn').textContent = t('view_video');
  }

  async initNews() {
    const newsContainer = document.querySelector('.news-list');
    if (this.news) {
      if (!this.news.length) {
        this.createNewsBlock(
          newsContainer,
          t('no_news_available'),
          t('news_follow_here')
        );
      } else {
        for (const newsItem of this.news) {
          const date = await this.getDate(newsItem.publish_date);
          this.createNewsBlock(
            newsContainer,
            newsItem.title,
            newsItem.content,
            newsItem.author,
            date
          );
        }
      }
    } else {
      this.createNewsBlock(
        newsContainer,
        t('error_contacting_server'),
        t('error_contacting_server')
      );
    }
  }

  createNewsBlock(container, title, content, author = '', date = {}) {
    const blockNews = document.createElement('div');
    blockNews.classList.add('news-block', 'opacity-1');
    blockNews.innerHTML = `
            <div class="news-header">
                <div class="header-text">
                    <div class="title">${title}</div>
                </div>
                ${
                  date.day
                    ? `<div class="date"><div class="day">${date.day}</div><div class="month">${date.month}</div></div>`
                    : ''
                }
            </div>
            <div class="news-content">
                <div class="bbWrapper">
                    <p>${content}</p>
                    ${
                      author
                        ? `<p class="news-author"><span>${author}</span></p>`
                        : ''
                    }
                </div>
            </div>`;
    container.appendChild(blockNews);
  }

  async initLaunch() {
    document.querySelector('.play-btn').addEventListener('click', async () => {
      await this.verifyModsBeforeLaunch();
      const opts = await this.getLaunchOptions();
      const playBtn = document.querySelector('.play-btn');
      const info = document.querySelector('.text-download');
      const progressBar = document.querySelector('.progress-bar');

      playBtn.style.display = 'none';
      info.style.display = 'block';
      launch.Launch(opts);

      const launcherSettings = (await this.database.get('1234', 'launcher'))
        .value;
      this.setupLaunchListeners(
        launch,
        info,
        progressBar,
        playBtn,
        launcherSettings
      );
    });
  }

  async getLaunchOptions() {
    const urlpkg = this.getBaseUrl();
    const uuid = (await this.database.get('1234', 'accounts-selected')).value;
    const account = (await this.database.get(uuid.selected, 'accounts')).value;
    const ram = (await this.database.get('1234', 'ram')).value;
    const javaPath = (await this.database.get('1234', 'java-path')).value;
    const javaArgs = (await this.database.get('1234', 'java-args')).value;
    const resolution = (await this.database.get('1234', 'screen')).value;
    const launcherSettings = (await this.database.get('1234', 'launcher'))
      .value;
        account.meta.type = 'mojang';

    const screen =
      resolution.screen.width === '<auto>'
        ? false
        : {
            width: resolution.screen.width,
            height: resolution.screen.height,
          };

    // Отримуємо сервер з this.config.servers по обраному ID
    const selectedServer = Object.values(this.config.servers).find(
      s => s.server_id == this.selectedServerId
    );
    if (!selectedServer) throw new Error("Server wasn't chosen");

    return {
      url: `${urlpkg}/${selectedServer.server_id}`,
      authenticator: account,
      timeout: 30000,
      path: `${dataDirectory}/${
        process.platform == 'darwin'
          ? this.config.dataDirectory
          : `.${this.config.dataDirectory}`
      }`,
      instance: selectedServer.name,
      version: selectedServer.minecraft_version,
      detached: launcherSettings.launcher.close === 'close-all' ? false : true,
      downloadFileMultiple: 30,
      loader: {
        type: selectedServer.loader_type,
        build:
          selectedServer.loader_type === 'forge'
            ? selectedServer.loader_forge_version
            : selectedServer.loader_type === 'fabric'
            ? selectedServer.loader_fabric_version
            : selectedServer.loader_build_version,
        enable: !!selectedServer.loader_activation,
      },
      verify: this.config.verify,
      ignored: [
        ...(Array.isArray(this.config.ignored)
          ? this.config.ignored
          : Object.values(this.config.ignored)),
        'launcher_config',
      ],
      java: {
        version: '16',
        type: 'jdk',
      }, 
      memory: {
        min: `${ram.ramMin * 1024}M`,
        max: `${ram.ramMax * 1024}M`,
      },
    };
  }

  getBaseUrl() {
    const baseUrl = settings_url.endsWith('/')
      ? settings_url
      : `${settings_url}/`;
    return pkg.env === 'azuriom'
      ? `${baseUrl}api/centralcorp/files`
      : `${baseUrl}data/`;
  }

  setupLaunchListeners(launch, info, progressBar, playBtn, launcherSettings) {
    launch.on('extract', extract => console.log(extract));
    launch.on('progress', (progress, size) =>
      this.updateProgressBar(progressBar, info, progress, size, t('download'))
    );
    launch.on('check', (progress, size) =>
      this.updateProgressBar(
        progressBar,
        info,
        progress,
        size,
        t('verification')
      )
    );
    launch.on('estimated', time => console.log(this.formatTime(time)));
    launch.on('speed', speed =>
      console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
    );
    launch.on('patch', patch => (info.innerHTML = t('patch_in_progress')));
    launch.on('data', e =>
      this.handleLaunchData(e, info, progressBar, playBtn, launcherSettings)
    );
    launch.on('close', code =>
      this.handleLaunchClose(code, info, progressBar, playBtn, launcherSettings)
    );
    launch.on('error', err => console.log(err));
  }

  updateProgressBar(progressBar, info, progress, size, text) {
    progressBar.style.display = 'block';
    info.innerHTML = `${text} ${((progress / size) * 100).toFixed(0)}%`;
    ipcRenderer.send('main-window-progress', { progress, size });
    progressBar.value = progress;
    progressBar.max = size;
  }

  formatTime(time) {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time - hours * 3600) / 60);
    const seconds = Math.floor(time - hours * 3600 - minutes * 60);
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  handleLaunchData(e, info, progressBar, playBtn, launcherSettings) {
    new logger('Minecraft', '#36b030');
    if (launcherSettings.launcher.close === 'close-launcher')
      ipcRenderer.send('main-window-hide');
    ipcRenderer.send('main-window-progress-reset');
    progressBar.style.display = 'none';
    info.innerHTML = t('starting');
    console.log(e);
  }

  handleLaunchClose(code, info, progressBar, playBtn, launcherSettings) {
    if (launcherSettings.launcher.close === 'close-launcher')
      ipcRenderer.send('main-window-show');
    progressBar.style.display = 'none';
    info.style.display = 'none';
    playBtn.style.display = 'block';
    info.innerHTML = t('verification');
    new logger('Launcher', '#7289da');
    console.log('Close');
  }

  async initStatusServer() {
    const infoItmUl = document.querySelector('.info-itm-ul');

    document.querySelector('.play-btn').disabled = true;

    // Логуємо вміст this.config.servers для дебагу
    console.log(this.config.servers);

    // Очищаємо контейнер перед додаванням нових елементів
    infoItmUl.innerHTML = '';

    // Проходимо по кожному серверу в config.servers
    for (const [key, server] of Object.entries(this.config.servers)) {
      console.log(
        `Processing server_id: ${server.server_id}, address: ${server.address}, port: ${server.port}`
      );

      // Створюємо li елемент
      const li = document.createElement('li');
      li.className = 'list-server';

      // Створюємо внутрішню структуру li
      li.innerHTML = `
            <div class="server">
                <img class="server-img" ${
                  server.icon
                    ? `src="${server.icon}"`
                    : 'assets/images/icon.png'
                } />
                <div class="server-text">
                    <div class="name" id="server-name-${
                      server.server_id
                    }"></div>
                    <div class="desc" id="server-desc-${
                      server.server_id
                    }"></div>
                </div>
                <div class="etat-text">
                    <div class="text" id="players-connected-${
                      server.server_id
                    }"></div>
                    <div class="online off" id="online-${
                      server.server_id
                    }"></div>
                </div>
            </div>
        `;

      li.dataset.serverId = server.server_id; // зберігаємо server_id
      li.classList.add('selectable-server');
      // Обробка кліку
      li.addEventListener('click', () => {
        // Знімаємо активність з інших серверів
        document
          .querySelectorAll('.list-server.active')
          .forEach(el => el.classList.remove('active'));

        // Активуємо обраний
        li.classList.add('active');

        // Зберігаємо обраний server_id
        this.selectedServerId = server.server_id;

        // Вмикаємо кнопку
        const playBtn = document.querySelector('.play-btn');
        playBtn.disabled = false;
      });

      // Додаємо li до ul
      infoItmUl.appendChild(li);

      // Отримуємо елементи для поточного серверу
      const nameServer = li.querySelector(`#server-name-${server.server_id}`);
      const serverMs = li.querySelector(`#server-desc-${server.server_id}`);
      const playersConnected = li.querySelector(
        `#players-connected-${server.server_id}`
      );
      const online = li.querySelector(`#online-${server.server_id}`);

      try {
        const serverPing = await new Status(
          server.address,
          server.port
        ).getStatus();

        if (!serverPing.error) {
          nameServer.textContent = server.name;
          serverMs.innerHTML = `<span class="green">${t(
            'server_online'
          )}</span> - ${serverPing.ms}${t('server_ping')}`;
          online.classList.toggle('off');
          playersConnected.textContent = serverPing.playersConnect || '0';
        } else {
          console.warn(
            `Server ${server.server_id} is unavailable: ${serverPing.error.message}`
          );
          nameServer.textContent = t('server_unavailable');
          serverMs.innerHTML = `<span class="red">${t('server_closed')}</span>`;
        }
      } catch (error) {
        console.error(
          `Error fetching status for server_id: ${server.server_id}, address: ${server.address}, port: ${server.port}`,
          error
        );
        nameServer.textContent = server.name;
        serverMs.innerHTML = `<span class="red">${t('server_closed')}</span>`;
      }
    }
  }

  async initVideo() {
    const videoContainer = document.querySelector('.ytb');
    if (!this.config.video_activate) {
      videoContainer.style.display = 'none';
      return;
    }

    const youtubeVideoId = this.config.video_url;
    const videoType = this.config.video_type;
    let youtubeEmbedUrl;

    if (videoType === 'short') {
      youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&playsinline=1`;
    } else if (videoType === 'video') {
      youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1`;
    } else {
      console.error('Invalid video type specified in the configuration.');
      return;
    }

    const youtubeThumbnailUrl = `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
    const videoThumbnail = videoContainer.querySelector('.youtube-thumbnail');
    const thumbnailImg = videoThumbnail.querySelector('.thumbnail-img');
    const playButton = videoThumbnail.querySelector('.ytb-play-btn');
    const btn = videoContainer.querySelector('.ytb-btn');

    btn.addEventListener('click', () =>
      shell.openExternal(`https://youtube.com/watch?v=${youtubeVideoId}`)
    );

    if (thumbnailImg && playButton) {
      thumbnailImg.src = youtubeThumbnailUrl;
      videoThumbnail.addEventListener('click', () => {
        videoThumbnail.innerHTML = `<iframe width="500" height="290" src="${youtubeEmbedUrl}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
      });
    }
  }

  async initAdvert() {
    const advertBanner = document.querySelector('.advert-banner');
    if (this.config.alert_activate) {
      const message = this.config.alert_msg;
      const firstParagraph = message.split('</p>')[0] + '</p>';
      const scrollingText = document.createElement('div');
      scrollingText.classList.add('scrolling-text');
      scrollingText.innerHTML = `${firstParagraph}`;
      advertBanner.innerHTML = '';
      advertBanner.appendChild(scrollingText);
      scrollingText.classList.toggle('no-scroll', !this.config.alert_scroll);
      advertBanner.style.display = 'block';
    } else {
      advertBanner.style.display = 'none';
    }
  }

  initBtn() {
    document.querySelector('.settings-btn').addEventListener('click', () => {
      changePanel('settings');
    });
  }

  async getDate(e) {
    const date = new Date(e);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const months = [
      t('january'),
      t('february'),
      t('march'),
      t('april'),
      t('may'),
      t('june'),
      t('july'),
      t('august'),
      t('september'),
      t('october'),
      t('november'),
      t('december'),
    ];
    return { year, month: months[month], day };
  }

  async verifyModsBeforeLaunch() {
    const playButton = document.querySelector('.play-btn');
    playButton.addEventListener('click', async () => {
      const modsDir = path.join(
        dataDirectory,
        process.platform == 'darwin'
          ? this.config.dataDirectory
          : `.${this.config.dataDirectory}`,
        'mods'
      );
      const launcherConfigDir = path.join(
        dataDirectory,
        process.platform == 'darwin'
          ? this.config.dataDirectory
          : `.${this.config.dataDirectory}`,
        'launcher_config'
      );
      const modsConfigFile = path.join(launcherConfigDir, 'mods_config.json');

      let modsConfig;
      try {
        modsConfig = JSON.parse(fs.readFileSync(modsConfigFile));
      } catch (error) {
        console.error('Failed to read mods config file:', error);
        return;
      }

      for (const mod in modsConfig) {
        const modFiles = fs
          .readdirSync(modsDir)
          .filter(
            file =>
              file.startsWith(mod) &&
              (file.endsWith('.jar') || file.endsWith('.jar-disable'))
          );
        if (modFiles.length > 0) {
          const modFile = modFiles[0];
          const modFilePath = path.join(modsDir, modFile);
          const newModFilePath = modsConfig[mod]
            ? modFilePath.replace('.jar-disable', '.jar')
            : modFilePath.endsWith('.jar-disable')
            ? modFilePath
            : `${modFilePath}.disable`;
          if (modFilePath !== newModFilePath) {
            fs.renameSync(modFilePath, newModFilePath);
          }
        }
      }
    });
  }

  displayEmptyModsMessage(modsListElement) {
    const modElement = document.createElement('div');
    modElement.innerHTML = `
            <div class="mods-container-empty">
              <h2>${t('optional_mods_not_downloaded')}</h2>
            </div>`;
    modsListElement.appendChild(modElement);
  }

  updateRole(account) {
    if (this.config.role && account.user_info.role) {
      const blockRole = document.createElement('div');
      blockRole.innerHTML = `<div>${t('grade')}: ${
        account.user_info.role.name
      }</div>`;
      document.querySelector('.player-role').appendChild(blockRole);
    } else {
      document.querySelector('.player-role').style.display = 'none';
    }
  }

  updateWhitelist(account) {
    const playBtn = document.querySelector('.play-btn');
    if (
      this.config.whitelist_activate &&
      !this.config.whitelist.includes(account.name) &&
      !this.config.whitelist_roles.includes(account.user_info.role.name)
    ) {
      playBtn.style.backgroundColor = '#696969';
      playBtn.style.pointerEvents = 'none';
      playBtn.style.boxShadow = 'none';
      playBtn.textContent = t('unavailable');
    } else {
      playBtn.style.backgroundColor = '#00bd7a';
      playBtn.style.pointerEvents = 'auto';
      playBtn.style.boxShadow = '2px 2px 5px rgba(0, 0, 0, 0.3)';
      playBtn.textContent = t('play');
    }
  }
}

export default Home;