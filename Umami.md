https://docs.umami.is/docs

更新数据库时区

```
ALTER DATABASE postgres SET timezone TO 'Asia/Shanghai';
```



添加Event事件方法

```html
data-umami-event="{event-name}"
```

```
<button id="signup-button" data-umami-event="Signup button">Sign up</button>
```

```
data-umami-event="Signup button"
data-umami-event-email="bob@aol.com"
data-umami-event-id="123"
```

启用性能探测：在跟踪脚本中添加

```html
data-performance="true"
```


