import * as vscode from 'vscode';
import * as https from 'https';

let button: vscode.StatusBarItem;
let channel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  setUpButton();
  setUpChannel();
  context.subscriptions.push(vscode.commands.registerCommand('chatgpt-codereview.codeReview', codeReview));
  context.subscriptions.push(vscode.commands.registerCommand('chatgpt-codereview.suggestMethodName', suggestMethodName));
  context.subscriptions.push(vscode.commands.registerCommand('chatgpt-codereview.suggestVariableName', suggestVariableName));
}

export function deactivate() { }

function apiKey(): string {
  const config = vscode.workspace.getConfiguration('chatgpt-codereview');
  return config.get<string>('apikey', '');
}

function setUpChannel() {
  channel = vscode.window.createOutputChannel('CodeReview');
}

function setUpButton() {
  button = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    1
  );
  resetLabelButton();
  button.command = 'chatgpt-codereview.codeReview';
  button.show();
}

function resetLabelButton() {
  button.text = 'CodeReview';
}

function changeLoadingButton() {
  button.text = 'CodeReview $(loading~spin)';
}

function codeText() {
  return '\n```\n'
    + vscode.window.activeTextEditor?.document.getText() + '\n'
    + '```\n';
}

function chunkToString(chunk: Buffer): string {
  const line = chunk.toString().replace('data: ', '').trim();
  if (line === '[DONE]') { return ''; }

  const data = JSON.parse(line);
  if (data.error) {
    vscode.window.showWarningMessage(`${data.error.type} : ${data.error.message}`);
    return '';
  }
  return data.choices[0].text;
}

function streamChat(channel: vscode.OutputChannel, prompt: string) {
  channel.show();
  const request = https.request({
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey()
    }
  }, (response) => {
    response.on('data', (chunk) => {
      channel.append(chunkToString(chunk));
    });
    response.on('end', () => {
      resetLabelButton();
    });
  });

  request.on('error', (error) => {
    vscode.window.showWarningMessage(error.message);
  });

  const body = JSON.stringify({
    model: 'text-davinci-003',
    prompt: prompt,
    max_tokens: 512,
    stream: true
  });

  request.write(body);
  request.end();
}

function codeReview() {
  if (apiKey() === '') {
    vscode.window.showWarningMessage('APIキーが設定されていません');
  } else {
    changeLoadingButton();
    streamChat(channel, `可読性の観点で、以下のコードを簡潔にコードレビューしてください。 \n${codeText()}`);
  }
}

async function suggestMethodName() {
  const result = await vscode.window.showInputBox({
    title: 'メソッド名の提案', 
    prompt: 'メソッドの動作を入力', 
    placeHolder: 'ファイルに出力 , 認可を与える , 初期設定を行う…'
  });
  if (result) {
    streamChat(channel, `プログラミングで「${result}」という処理を行うメソッド名の候補をいくつか教えてください`);
  }
}

async function suggestVariableName() {
  const result = await vscode.window.showInputBox({
    title: '変数名の提案', 
    prompt: '変数の特徴', 
    placeHolder: 'ユーザ名 , 通信結果 , 同意済み…'
  });
  if (result) {
    streamChat(channel, `プログラミングで「${result}」という役割の変数名の候補をいくつか教えてください`);
  }
}

