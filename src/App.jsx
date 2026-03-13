import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Layout,
  Typography,
  Button,
  Table,
  Modal,
  Form,
  Input,
  message,
  Space,
  Card,
  Spin,
  Switch,
  Drawer,
  Descriptions
} from "antd";
import {
  GithubOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

const { Header, Content, Footer } = Layout;
const { Title, Text, Link } = Typography;

const App = () => {
  const [servers, setServers] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [form] = Form.useForm();
  const [selectedServer, setSelectedServer] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disableManualCommands, setDisableManualCommands] = useState(true); // 默认禁用
  const [showAbout, setShowAbout] = useState(false);

  // Refs
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null); // 独立保存 fitAddon
  const terminalContainerRef = useRef(null);
  const resizeObserverRef = useRef(null); // 保存 ResizeObserver

  const disableManualCommandsRef = useRef(disableManualCommands);

  useEffect(() => {
  disableManualCommandsRef.current = disableManualCommands;
}, [disableManualCommands]);
  // 状态锁
  const connectionStateRef = useRef({
    isConnecting: false,
    isDisconnecting: false,
    currentServerId: null
  });

  // 1. 初始化逻辑 (仅在组件挂载时执行一次)
  useEffect(() => {
    const init = async () => {
      await loadServerConfigs();
      initTerminal(); // 初始化终端实例（但不一定显示）
      setLoading(false);
    };
    init();

    return () => {
      // 清理 SSH 监听
      window.electronAPI.removeAllListeners?.("ssh-data");
      window.electronAPI.removeAllListeners?.("ssh-closed");
      
      // 强制断开连接
      disconnectSSH(true);
      
      // 清理 ResizeObserver
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }

      // 销毁终端
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, []);

  // 2. 监听显示状态变化，重新调整终端大小
  // 关键修复：xterm 不能在 display: none 的容器中正确计算大小
  // 当变为 block 时，必须重新 fit()
  useEffect(() => {
    if (isConnected && fitAddonRef.current && terminalRef.current) {
      // 使用 setTimeout 让 DOM 渲染完成后再 fit
      const timer = setTimeout(() => {
        fitAddonRef.current.fit();
        terminalRef.current.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  // 初始化终端方法的重构
  const initTerminal = () => {
    // 防止重复创建
    if (terminalRef.current) return;
    if (!terminalContainerRef.current) return;

    // 清空容器，防止 React 开发模式下的重复渲染导致追加多个 canvas
    terminalContainerRef.current.innerHTML = '';

    const terminal = new Terminal({
      cursorBlink: true,
      allowTransparency: true,
      copyOnSelect: true,
      rightClickSelectsWord: true,
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
      },
      // 初始行列并不重要，fitAddon 会接管
      cols: 80, 
      rows: 24,
      scrollback: 10000,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    });

    // Addons
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    
    fitAddonRef.current = fitAddon; // 保存引用

    // 挂载
    terminal.open(terminalContainerRef.current);
    terminalRef.current = terminal;

    // 事件监听：复制
    terminal.onSelectionChange(() => {
      if (terminal.hasSelection()) {
        const selectedText = terminal.getSelection();
        navigator.clipboard.writeText(selectedText).catch(() => {});
      }
    });

    // 事件监听：右键粘贴
    terminalContainerRef.current.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        terminal.paste(text);
      }).catch(() => {});
    });

    // 事件监听：用户输入
    terminal.onData((data) => {
        // 只有连接状态下才发送数据，且未禁用手动命令
        if (connectionStateRef.current.currentServerId && !disableManualCommandsRef.current) {
            window.electronAPI.sendSSHData(data);
        } else if (disableManualCommandsRef.current) {
            // 如果禁用手动命令，显示提示信息
            terminalRef.current?.write('\r\n\x1b[33m[系统提示：手动命令已禁用]\x1b[0m\r\n');
        }
    });

    // 优化：使用 ResizeObserver 替代 window.resize
    // 这样不仅窗口变化，侧边栏变化导致的容器大小变化也能捕捉到
    const resizeObserver = new ResizeObserver(() => {
        // 只有在显示的时候才 fit，避免报错
        if (terminalContainerRef.current && terminalContainerRef.current.offsetParent) {
            fitAddon.fit();
        }
    });
    
    resizeObserver.observe(terminalContainerRef.current);
    resizeObserverRef.current = resizeObserver;
  };

  const loadServerConfigs = async () => {
    try {
      const configs = await window.electronAPI.getServerConfigs();
      setServers(configs || []);
    } catch (error) {
      console.error('加载服务器配置失败:', error);
      message.error('加载服务器配置失败');
    }
  };

  const showModal = (server = null) => {
    setEditingServer(server);
    if (server) {
      form.setFieldsValue(server);
    } else {
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
    setEditingServer(null);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const serverConfig = {
        ...values,
        id: editingServer ? editingServer.id : Date.now().toString(),
      };

      if (editingServer) {
        await window.electronAPI.updateServerConfig(serverConfig);
      } else {
        await window.electronAPI.saveServerConfig(serverConfig);
      }

      message.success(`${editingServer ? "更新" : "添加"}服务器配置成功`);
      await loadServerConfigs();
      handleCancel();
    } catch (error) {
      message.error("请检查表单填写");
    }
  };

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.deleteServerConfig(id);
      message.success("删除成功");
      await loadServerConfigs();
      
      // 如果删除了当前连接的服务器，则断开
      if (selectedServer && selectedServer.id === id) {
          disconnectSSH();
      }
    } catch (error) {
      message.error("删除失败");
    }
  };

  const connectSSH = async (server) => {
    if (connectionStateRef.current.isConnecting) return;

    // 如果已经在连接当前服务器，忽略
    if (isConnected && connectionStateRef.current.currentServerId === server.id) return;

    // 如果连接了其他服务器，先断开
    if (isConnected) {
      await disconnectSSH();
    }

    connectionStateRef.current.isConnecting = true;

    try {
      // 确保终端已初始化
      if (!terminalRef.current) initTerminal();
      
      // 清理终端屏幕，准备迎接新连接
      terminalRef.current.clear(); 
      terminalRef.current.write(`\r\nConnecting to ${server.host}...\r\n`);

      // 建立SSH连接
      await window.electronAPI.connectSSH(server);
      
      // 移除旧的监听器，防止内存泄漏或重复处理
      window.electronAPI.removeAllListeners?.("ssh-data");
      window.electronAPI.removeAllListeners?.("ssh-closed");

      // 绑定新监听器
      window.electronAPI.onSSHData((data) => {
        terminalRef.current?.write(data);
      });

      window.electronAPI.onSSHClosed(() => {
        disconnectSSH();
        terminalRef.current?.write('\r\n\x1b[31mConnection closed.\x1b[0m\r\n');
      });

      // 更新状态
      setIsConnected(true);
      setSelectedServer(server);
      connectionStateRef.current.currentServerId = server.id;
      message.success("已连接");

    } catch (error) {
      terminalRef.current?.write(`\r\n\x1b[31mConnection failed: ${error.message}\x1b[0m\r\n`);
      message.error("连接失败: " + error.message);
      setIsConnected(false);
      connectionStateRef.current.currentServerId = null;
    } finally {
      connectionStateRef.current.isConnecting = false;
    }
  };

  const disconnectSSH = async (force = false) => {
    if (connectionStateRef.current.isDisconnecting && !force) return;
    
    connectionStateRef.current.isDisconnecting = true;

    try {
      await window.electronAPI.disconnectSSH();
    } catch (err) {
      console.warn("Disconnect error:", err);
    } finally {
      // 清理 Electron 监听器
      window.electronAPI.removeAllListeners?.("ssh-data");
      window.electronAPI.removeAllListeners?.("ssh-closed");

      setIsConnected(false);
      setSelectedServer(null);
      connectionStateRef.current.currentServerId = null;
      connectionStateRef.current.isDisconnecting = false;
      
      // 这里不销毁终端实例，也不必清空屏幕（保留最后的日志供用户查看），
      // 只是将状态置为断开。用户下次连接时再 clear。
      message.info("连接已断开");
    }
  };

  const viewLiveLog = async (server) => {
    if (connectionStateRef.current.currentServerId !== server.id) {
       await connectSSH(server);
    }
    // 等待一小会儿确保 SSH 连接建立后再发送命令
    setTimeout(() => {
        window.electronAPI.sendSSHData(`tail -f ${server.logPath}\n`);
    }, 500);
  };

  const searchLog = async (server) => {
    let inputRef = null;
    Modal.confirm({
      title: "日志搜索",
      content: (
        <Input
          ref={(node) => (inputRef = node)}
          placeholder="请输入搜索关键词"
          onPressEnter={() => { /* 可以处理回车 */ }}
        />
      ),
      onOk: async () => {
        const keyword = inputRef?.input?.value;
        if (!keyword) return;

        if (connectionStateRef.current.currentServerId !== server.id) {
            await connectSSH(server);
        }
        
        // 同样延迟发送，确保 Socket 准备好
        setTimeout(() => {
             // 使用 clear 防止混淆，然后 grep
            terminalRef.current?.write('\r\n--- Search Result ---\r\n');
            window.electronAPI.sendSSHData(`grep -n --color=always "${keyword}" ${server.logPath}\n`);
        }, 500);
      },
    });
  };

  const copyTerminalContent = () => {
    if (!terminalRef.current) return;

    // 更好的全选复制方式
    terminalRef.current.selectAll();
    const content = terminalRef.current.getSelection();
    terminalRef.current.clearSelection(); // 复制后清除选中状态

    if (content) {
      navigator.clipboard.writeText(content)
        .then(() => message.success("已复制全部内容"))
        .catch(() => message.error("复制失败"));
    } else {
      message.warning("终端内容为空");
    }
  };

  // 日志分析：复制全部日志并打开分析链接
  const analyzeAllLogs = () => {
    if (!terminalRef.current) return;

    terminalRef.current.selectAll();
    const content = terminalRef.current.getSelection();
    terminalRef.current.clearSelection();

    if (content) {
      navigator.clipboard.writeText(content)
        .then(() => {
          window.electronAPI.openExternal("https://sql.123408.xyz/?source=clipboard");
          message.success("已复制日志并打开分析页面");
        })
        .catch(() => message.error("复制失败"));
    } else {
      message.warning("终端内容为空");
    }
  };

  // 选中分析：复制选中内容并打开分析链接
  const analyzeSelectedLogs = () => {
    if (!terminalRef.current) return;

    const selectedText = terminalRef.current.getSelection();

    if (selectedText && selectedText.trim()) {
      navigator.clipboard.writeText(selectedText)
        .then(() => {
          window.electronAPI.openExternal("https://sql.123408.xyz/?source=clipboard");
          message.success("已复制选中内容并打开分析页面");
        })
        .catch(() => message.error("复制失败"));
    } else {
      message.warning("请先选择要分析的日志内容");
    }
  };

  const columns = [
    {
      title: "服务器名称",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "主机地址",
      dataIndex: "host",
      key: "host",
    },
    {
      title: "端口",
      dataIndex: "port",
      key: "port",
    },
    {
      title: "用户名",
      dataIndex: "username",
      key: "username",
    },
    {
      title: "日志路径",
      dataIndex: "logPath",
      key: "logPath",
    },
    {
      title: "备注",
      dataIndex: "remark",
      key: "remark",
    },
    {
      title: "操作",
      key: "action",
      render: (_, record) => (
        <Space>
          {isConnected && selectedServer?.id === record.id ? (
            <Button type="primary" danger onClick={() => disconnectSSH()}>
              断开连接
            </Button>
          ) : (
            <Button type="primary" onClick={() => connectSSH(record)}>
              连接
            </Button>
          )}
          <Button type="primary" onClick={() => viewLiveLog(record)}>
            实时日志
          </Button>
          <Button type="primary" onClick={() => searchLog(record)}>
            搜索日志
          </Button>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => showModal(record)}
          >
            编辑
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  // 样式部分，确保终端容器可见性处理正确
  return (
     <Layout className="app-container">
      <Header className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', background: '#001529' }}>
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Title level={4} style={{ color: 'white', margin: 0 }}>
      远程服务器日志查询工具
    </Title>
    <Text style={{ marginLeft: "16px", color: 'white' }}>v2.0.0</Text>
    <Text style={{ marginLeft: "16px", color: 'white' }}>作者: KK</Text>
  </div>
  <Space>
    <Switch 
      checked={!disableManualCommands} 
      onChange={(checked) => {
        setDisableManualCommands(!checked);
      }}
      checkedChildren="手动命令已启用"
      unCheckedChildren="手动命令已禁用"
              style={{
                marginRight: 16,
                backgroundColor: disableManualCommands
                  ? '#52c41a' // 绿色：禁用（安全）
                  : '#ff4d4f', // 红色：启用（危险）
              }}
    />
    <Button 
      type="text" 
      icon={<InfoCircleOutlined />} 
      onClick={() => setShowAbout(true)}
      style={{ color: 'white' }}
    >
      关于
    </Button>
  </Space>
</Header>
      
      <Content style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ flex: '0 0 auto', marginBottom: 20 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
                添加服务器
            </Button>
        </div>

        {/* 将布局改为 Flex 布局，
            如果未连接：表格占满高度。
            如果已连接：表格固定高度，终端占满剩余高度。
         */}
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%', 
            overflow: 'hidden',
            gap: '16px' 
        }}>
            <div style={{ flex: isConnected ? '0 0 40%' : '1 1 auto', overflow: 'auto', transition: 'all 0.3s' }}>
                <Table
                    columns={columns}
                    dataSource={servers}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    onRow={(record) => ({
                        onClick: () => { if(!isConnected) setSelectedServer(record) },
                    })}
                    rowClassName={(record) => record.id === selectedServer?.id ? "ant-table-row-selected" : ""}
                />
            </div>

            {/* 终端容器：始终渲染 DOM，通过 display 控制显示，
                这样可以保证 xterm 实例不被 React 销毁，从而复用实例 */}
            <div style={{ 
                flex: '1 1 auto', 
                display: isConnected ? 'flex' : 'none', 
                flexDirection: 'column',
                minHeight: 0, // 关键：允许 flex 子元素小于内容高度以产生滚动条
                border: '1px solid #333',
                borderRadius: '8px',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '8px',
                    background: '#252526',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between'
                }}>
                    <Text style={{ color: '#fff' }}>
                        {selectedServer ? `${selectedServer.username}@${selectedServer.host}` : 'Terminal'}
                    </Text>
                    <Space>
                        <Button type="text" size="small" icon={<CopyOutlined />} onClick={copyTerminalContent} style={{ color: '#fff' }}>
                            复制全部
                        </Button>
                        <Button type="text" size="small" onClick={analyzeAllLogs} style={{ color: '#52c41a' }}>
                            日志分析
                        </Button>
                        <Button type="text" size="small" onClick={analyzeSelectedLogs} style={{ color: '#1890ff' }}>
                            选中分析
                        </Button>
                    </Space>
                </div>
                
                <div 
                    ref={terminalContainerRef} 
                    style={{ 
                        flex: 1, 
                        background: '#1e1e1e', 
                        overflow: 'hidden',
                        padding: '4px'
                    }} 
                />
            </div>
        </div>
      </Content>
      
      {/* Modal 代码保持不变 */}
      <Modal
        title={`${editingServer ? "编辑" : "添加"}服务器配置`}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
             <Form.Item name="name" label="服务器名称" rules={[{ required: true }]}><Input /></Form.Item>
             <Form.Item name="host" label="主机地址" rules={[{ required: true }]}><Input /></Form.Item>
             <Form.Item name="port" label="端口" initialValue="22" rules={[{ required: true }]}><Input type="number" /></Form.Item>
             <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item>
             <Form.Item name="password" label="密码" rules={[{ required: true }]}><Input.Password /></Form.Item>
             <Form.Item name="logPath" label="日志路径" rules={[{ required: true }]}><Input /></Form.Item>
             <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
        </Form>
      </Modal>
      
      {/* 关于抽屉 */}
      <Drawer
        title="关于远程服务器日志查询工具"
        placement="right"
        onClose={() => setShowAbout(false)}
        open={showAbout}
        width={400}
      >
        <Descriptions column={1} bordered>
          <Descriptions.Item label="项目名称">远程服务器日志查询工具</Descriptions.Item>
          <Descriptions.Item label="版本">v2.0.0</Descriptions.Item>
          <Descriptions.Item label="作者">KK</Descriptions.Item>
          <Descriptions.Item label="技术栈">React + Electron + Ant Design + xterm.js</Descriptions.Item>
          <Descriptions.Item label="许可证">MIT</Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 20 }}>
          <h4>功能特性</h4>
          <ul>
            <li>实时日志查看：通过 SSH 连接，实时查看远程服务器的日志输出</li>
            <li>日志搜索：支持关键字搜索功能，快速查找日志中的相关信息</li>
            <li>多服务器管理：轻松添加、编辑和删除服务器配置</li>
            <li>安全控制：默认禁用手动命令，提高安全性</li>
          </ul>
        </div>
        <div style={{ marginTop: 20 }}>
          <h4>安全说明</h4>
          <p>默认情况下，手动命令已被禁用，以防止意外操作。您可以通过顶部的开关来启用或禁用手动命令功能。</p>
          <p>即使禁用手动命令，您仍然可以使用"实时日志"和"搜索"功能来查看服务器日志。</p>
        </div>
        <div style={{ marginTop: 20 }}>
          <h4>开源信息</h4>
          <p>本项目为开源项目，欢迎贡献代码和建议！</p>
          <p>GitHub 仓库：<a href="https://github.com/123xiao/remote-log-viewer" target="_blank">https://github.com/123xiao/remote-log-viewer</a></p>
        </div>
      </Drawer>
      
      <Footer style={{ textAlign: "center" }}>
        <Space direction="vertical">
          <Text>
            一个简单易用的远程服务器日志查询工具，支持实时日志查看和关键词搜索
          </Text>
          <Link
            href="https://github.com/123xiao/remote-log-viewer"
            target="_blank"
          >
            <Space>
              <GithubOutlined />
              在GitHub上查看源码
            </Space>
          </Link>
        </Space>
      </Footer>
    </Layout>
  );
};

export default App;