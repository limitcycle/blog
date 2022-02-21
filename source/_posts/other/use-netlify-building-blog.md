---
title: '[Other] 利用Netlify架設Blog'
date: 2021-12-21 16:26:01
tags: other
categories: 學習
toc: true
cover: /images/other/use-netlify-building-blog/netlify_logo_icon_169924.png
---

當Blog開發好時，需要架設在一個可以託管靜態網頁的網站上，常見的服務有Netlify、Heroku、GitHub Page、GitLab Page、FireBase、S3...等服務。

最後選擇了Netlify，主要是對我這種免費仔跟懶人很便利(:laughing:)，讓我們一起來看看如何在Netlify有什麼方便的服務幫助我們架設Blog吧！

<!-- more -->

## Netlify提供了什麼服務

![Netlify官網](/images/other/use-netlify-building-blog/01_netlify_official_website.png)

+ Netlify官網: <https://www.netlify.com/>
+ 託管靜態網頁
+ 可以直接連結你的GitHub or GitLab repo
+ 自動建構、部屬靜態網頁

## 將靜態網頁部屬到Netlify

### 登入Netlify

![使用GitHub帳號登入Netlify](/images/other/use-netlify-building-blog/02_github_account_login_netlify.png)

Netlify提供許多登入方式(如上圖)，在這裡我使用GitHub帳號登入，方便之後連結GitHub上的repo

### 新增靜態網頁

進入 Sites 選單 &rarr; Add new site &rarr; Import an existing project

![選擇已有的專案匯入](/images/other/use-netlify-building-blog/03_add_new_site.png)

### 連結GitHub帳號

![連結GitHub帳號](/images/other/use-netlify-building-blog/04-connect-github.png)

### 選擇要產生靜態網頁的repo

![選擇要產生靜態網頁的repo](/images/other/use-netlify-building-blog/05-pick-a-repo.png)

### Basic build settings(基礎建置設定)

![Basic build settings](/images/other/use-netlify-building-blog/06-Basic-build-settings.png)

Netlify會自動偵測使用何種框架產生靜態網頁，例如: 此部落格使用[Hexo](https://hexo.io/zh-tw/)框架產生靜態網頁

若是偵測的指令有錯，可以自行在`Build command`進行修改

+ **Build Command**: 產生靜態網頁的指令(如上圖①)
+ **Publish directory**: 靜態網頁產生後的位置(如上圖②)

以上若設定好之後，可以按下`Deploy site`(如上圖③)，會自動依照你的設定部屬網站

### 查看結果

![佈署結果](/images/other/use-netlify-building-blog/07-deploy-complete.png)

可以看到Netlify會幫我們產生一個網址，可以點選此網址查看網站內容

若是想要自定義網站網址的話，可以參考下一節`自定義網站網址`

## 自定義網站網址

自定義網址可以在Netlify進行購買或者在外部買一個網址，接著透過Netlify DNS解析

以下方法採取在Gandi購買一個網址，然後透過Netlify DNS作解析

### Gandi小資料

> Gandi官網：<https://www.gandi.net/zh-Hant>
> 提供網域名稱、網頁代管、SSL憑證與電子信箱...等服務

![Gandi官網](/images/other/use-netlify-building-blog/08-gandi-official-website.png)

### 在Gandi購買網址

確認你要買的網址沒被使用，接著就可以按下加入購物車進行購買

剩下的步驟就按照網站的流程下去進行，就可以順利將此網址購買成功

![確認網址並購買](/images/other/use-netlify-building-blog/09-buy-domain.png)

購買成功後，可以在`管理者界面`中`域名`菜單中看到所購買的網址，可以點選網址做進階設定

![Gandi管理者界面](/images/other/use-netlify-building-blog/10-gandi-admin-console.png)

![網址進階設定畫面](/images/other/use-netlify-building-blog/11-domain-advance-settings.png)

### 回到Netlify設定網址

回到Netlify進入剛剛建立的`site`，接著點選`Domain settings`(如下圖①)

![Domain settings](/images/other/use-netlify-building-blog/12-custom-domain.png)

點選`Add custom domain`

![Add custom domain](/images/other/use-netlify-building-blog/13-add-custom-domain.png)

輸入剛剛購買的網址並驗證

![驗證網址](/images/other/use-netlify-building-blog/14-verify-domain.png)

驗證沒錯之後點選加入，接著會出現Netlify DNS Name servers(名稱伺服器)

![Netlify DNS Name Servers](/images/other/use-netlify-building-blog/15-netlify-dns-name-servers.png)

記住這些Name Server，等等會用到

### 到Gandi設定Name Server

點選`名稱伺服器`

![網址名稱伺服器位置](/images/other/use-netlify-building-blog/16-enter-name-servers.png)

接著選擇`外部`，並填入剛剛在Netlify上看到的那4個Name Server，接著按下儲存

![改成Netlify Name Server](/images/other/use-netlify-building-blog/17-settings-gandi-outside-name-server.png)

等它生效需要一段時間

### 回到Netlify查看結果

Netlify會自動幫我們剛剛設定的網域掛上SSL/TLS憑證

![SSL/TLS憑證](/images/other/use-netlify-building-blog/18-ssl-tls.png)

成功之後，下圖就會變成我們剛剛輸入的網址

![成功掛上自定義網址畫面](/images/other/use-netlify-building-blog/19-finish-custom-domain.png)

恭喜你!!這樣就可以使用自定義的網址訪問你的網站了
