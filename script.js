'use strict';

const imageInput = document.getElementById('imageInput');
const imageList = document.getElementById('imageList');
const statusText = document.getElementById('status');
const itemCount = document.getElementById('itemCount');
const searchInput = document.getElementById('searchInput');
const cameraStartButton = document.getElementById('cameraStartButton');
const cameraStopButton = document.getElementById('cameraStopButton');
const cameraReaderElement = document.getElementById('camera-reader');
const sortNameButton = document.getElementById('sortNameButton');
const sortTimeButton = document.getElementById('sortTimeButton');
const deleteAllButton = document.getElementById('deleteAllButton');
const csvButton = document.getElementById('csvButton');

const STORAGE_KEY = 'qrCodeRecords';
let records = [];
let nextId = 1;
let imageReader = null;
let cameraReader = null;
let cameraRunning = false;
let lastCameraText = '';

function setStatus(message, type = '') {
    statusText.textContent = message;
    statusText.className = `status${type ? ' ' + type : ''}`;
}

function loadRecords() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        records = Array.isArray(saved) ? saved : [];
    } catch (error) {
        console.error('データ読み込みエラー:', error);
        records = [];
    }
    nextId = records.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function saveRecords() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        return true;
    } catch (error) {
        console.error('データ保存エラー:', error);
        setStatus('保存できませんでした。画像サイズまたは保存容量を確認してください。', 'error');
        return false;
    }
}

function checkQrLibrary() {
    if (typeof Html5Qrcode === 'undefined' || typeof Html5QrcodeSupportedFormats === 'undefined') {
        throw new Error('QR読み取りライブラリを読み込めません。インターネット接続を確認してください。');
    }
}

function convertImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('画像を読み込めませんでした。'));
        reader.readAsDataURL(file);
    });
}

function playSound(isError = false) {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = isError ? 220 : 880;
        gain.gain.setValueAtTime(0.12, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.18);
        oscillator.onended = () => context.close();
    } catch (error) {
        console.warn('効果音を再生できませんでした:', error);
    }
}

function isDuplicate(qrText) {
    return records.some(record => record.readOK && record.qrText === qrText);
}

function addRecord(qrText, fileName, imageURL = '') {
    if (isDuplicate(qrText)) {
        setStatus('このQRコードはすでに登録されています。', 'error');
        playSound(true);
        return false;
    }

    const newRecord = {
        id: nextId,
        fileName: fileName || 'camera-qr',
        qrText,
        readOK: true,
        time: formatDate(new Date()),
        imageURL
    };

    records.push(newRecord);
    if (!saveRecords()) {
        records.pop();
        return false;
    }

    nextId++;
    renderRecords();
    setStatus('QRコードを読み込み、保存しました。', 'success');
    playSound(false);
    return true;
}

imageInput.addEventListener('change', async event => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
        checkQrLibrary();
        if (cameraRunning) await stopCamera();
        setStatus('QRコードを読み込んでいます...', '');

        if (!imageReader) {
            imageReader = new Html5Qrcode('camera-reader', {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                verbose: false
            });
        }

        let success = 0;
        let duplicate = 0;
        let failed = 0;

        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                failed++;
                continue;
            }

            try {
                const decodedText = await imageReader.scanFile(file, false);
                const imageData = await convertImageToBase64(file);
                if (addRecord(decodedText, file.name, imageData)) success++;
                else duplicate++;
            } catch (error) {
                console.warn('QR読み込み失敗:', file.name, error);
                failed++;
            }
        }

        if (success || duplicate || failed) {
            setStatus(`${success} 件成功、${duplicate} 件重複、${failed} 件失敗しました。`, failed || duplicate ? 'error' : 'success');
        }
    } catch (error) {
        console.error(error);
        setStatus(error.message || 'QR読み取り機能を初期化できませんでした。', 'error');
    } finally {
        imageInput.value = '';
    }
});

function formatDate(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getVisibleRecords() {
    const keyword = searchInput.value.trim().toLocaleLowerCase();
    return records.filter(record =>
        !keyword ||
        String(record.qrText).toLocaleLowerCase().includes(keyword) ||
        String(record.fileName).toLocaleLowerCase().includes(keyword)
    );
}

function renderRecords() {
    imageList.innerHTML = '';
    const visible = getVisibleRecords();

    if (!visible.length) {
        const row = document.createElement('tr');
        row.className = 'empty-row';
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = records.length ? '検索結果がありません。' : 'まだ読み込みデータがありません。';
        row.appendChild(cell);
        imageList.appendChild(row);
    } else {
        visible.forEach((record, index) => {
            const row = document.createElement('tr');

            const photoCell = document.createElement('td');
            if (record.imageURL) {
                const photo = document.createElement('img');
                photo.className = 'qr-photo';
                photo.src = record.imageURL;
                photo.alt = record.fileName || 'QRコード画像';
                photoCell.appendChild(photo);
            } else {
                photoCell.textContent = 'カメラ';
            }

            const numberCell = document.createElement('td');
            numberCell.textContent = String(index + 1);

            const nameCell = document.createElement('td');
            nameCell.className = 'qr-content';
            nameCell.textContent = record.qrText;

            const timeCell = document.createElement('td');
            timeCell.textContent = record.time;

            const deleteCell = document.createElement('td');
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'delete-button';
            deleteButton.textContent = '削除';
            deleteButton.addEventListener('click', () => deleteRecord(record.id));
            deleteCell.appendChild(deleteButton);

            row.append(photoCell, numberCell, nameCell, timeCell, deleteCell);
            imageList.appendChild(row);
        });
    }
    itemCount.textContent = `${records.length} 件`;
}

function deleteRecord(id) {
    if (!window.confirm('このデータを削除しますか？')) return;
    const previous = records;
    records = records.filter(record => record.id !== id);
    if (!saveRecords()) {
        records = previous;
        return;
    }
    renderRecords();
    setStatus('データを削除しました。', 'success');
}

deleteAllButton.addEventListener('click', () => {
    if (!records.length) {
        setStatus('削除するデータがありません。');
        return;
    }
    if (!window.confirm('すべてのデータを削除しますか？この操作は取り消せません。')) return;
    const previous = records;
    records = [];
    if (!saveRecords()) {
        records = previous;
        return;
    }
    renderRecords();
    setStatus('すべてのデータを削除しました。', 'success');
});

sortNameButton.addEventListener('click', () => {
    records.sort((a, b) => String(a.qrText).localeCompare(String(b.qrText), 'ja'));
    if (saveRecords()) {
        renderRecords();
        setStatus('名前順に並べ替えました。', 'success');
    }
});

sortTimeButton.addEventListener('click', () => {
    records.sort((a, b) => parseDate(b.time) - parseDate(a.time));
    if (saveRecords()) {
        renderRecords();
        setStatus('新しい時間順に並べ替えました。', 'success');
    }
});

function parseDate(value) {
    const [datePart, timePart] = String(value).split(' ');
    const [year, month, day] = datePart.split('/').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute).getTime();
}

searchInput.addEventListener('input', renderRecords);


csvButton.addEventListener('click', () => {
    if (!records.length) {
        setStatus('CSV出力するデータがありません。', 'error');
        return;
    }

    const quote = value =>
        '"' + String(value ?? '').replace(/"/g, '""') + '"';

    const rows = [
        ['Name（QR情報）', 'Time'],
        ...records.map(record => [record.qrText, record.time])
    ];

    const csv = '\uFEFF' +
        rows.map(row => row.map(quote).join(',')).join('\r\n');

    const blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'qr_records.csv';

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    setStatus('CSVファイルを出力しました。', 'success');
});


cameraStartButton.addEventListener('click', startCamera);

async function startCamera() {
    try {
        checkQrLibrary();
        if (cameraRunning) return;

        if (!cameraReader) {
            cameraReader = new Html5Qrcode('camera-reader', {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                verbose: false
            });
        }

        cameraReaderElement.classList.add('active');
        setStatus('カメラを起動しています...', '');
        await cameraReader.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async decodedText => {
                if (decodedText === lastCameraText) return;
                lastCameraText = decodedText;
                await stopCamera();
                addRecord(decodedText, 'camera-qr', '');
            },
            () => {}
        );

        cameraRunning = true;
        cameraStartButton.disabled = true;
        cameraStopButton.disabled = false;
        setStatus('QRコードをカメラに映してください。', 'success');
    } catch (error) {
        console.error('カメラ起動エラー:', error);
        cameraRunning = false;
        cameraReaderElement.classList.remove('active');
        cameraStartButton.disabled = false;
        cameraStopButton.disabled = true;
        setStatus('カメラを起動できません。カメラの許可とHTTPS接続を確認してください。', 'error');
    }
}

async function stopCamera() {
    if (cameraReader && cameraRunning) {
        try {
            await cameraReader.stop();
            await cameraReader.clear();
        } catch (error) {
            console.warn('カメラ停止エラー:', error);
        }
    }
    cameraRunning = false;
    cameraStartButton.disabled = false;
    cameraStopButton.disabled = true;
    cameraReaderElement.classList.remove('active');
}

cameraStopButton.addEventListener('click', async () => {
    await stopCamera();
    setStatus('カメラを停止しました。');
});

loadRecords();
renderRecords();
