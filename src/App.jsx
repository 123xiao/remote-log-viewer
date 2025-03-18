import React, { useState, useEffect, useRef } from "react";
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
} from "antd";
import { GithubOutlined } from "@ant-design/icons";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

const { Header, Content, Footer } = Layout;
const { Title, Text, Link } = Typography;
//const { Title } = Typography;

const App = () => {
  const [servers, setServers] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [form] = Form.useForm();
  const [selectedServer, setSelectedServer] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const terminalRef = useRef(null);
  const terminalContainerRef = useRef(null);
  const sshClientRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      await loadServerConfigs();
      initTerminal();
      setLoading(false);
    };
    init();
    return () => {
      if (terminalRef.current?.cleanup) {
        terminalRef.current.cleanup();
      }
      disconnectSSH();
    };
  }, []);

  const initTerminal = () => {
    if (terminalContainerRef.current) {
      if (!terminalRef.current) {
        const terminal = new Terminal({
          cursorBlink: true,
          allowTransparency: true,
          copyOnSelect: true,
          rightClickSelectsWord: true,
          allowProposedApi: true,
          rightClickPaste: true,
          theme: {
            background: "#1e1e1e",
            foreground: "#d4d4d4",
          },
          cols: 200,
          rows: 50,
          scrollback: 10000,
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          lineHeight: 1.2,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon());

        terminal.open(terminalContainerRef.current);

        setTimeout(() => {
          fitAddon.fit();
        }, 0);

        terminalRef.current = terminal;

        const handleResize = () => {
          fitAddon.fit();
        };

        window.addEventListener("resize", handleResize);

        terminalRef.current.cleanup = () => {
          window.removeEventListener("resize", handleResize);
          terminal.dispose();
        };
      }
    }
  };

  const loadServerConfigs = async () => {
    const configs = await window.electronAPI.getServerConfigs();
    setServers(configs);
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
      loadServerConfigs();
      handleCancel();
    } catch (error) {
      message.error("表单验证失败");
    }
  };

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.deleteServerConfig(id);
      message.success("删除服务器配置成功");
      loadServerConfigs();
    } catch (error) {
      message.error("删除失败");
    }
  };

  const connectSSH = async (server) => {
    if (isConnected) {
      await disconnectSSH();
    }

    try {
      if (!terminalRef.current) {
        const terminal = new Terminal({
          cursorBlink: true,
          allowTransparency: true,
          copyOnSelect: true,
          rightClickSelectsWord: true,
          allowProposedApi: true,
          rightClickPaste: true,
          theme: {
            background: "#1e1e1e",
            foreground: "#d4d4d4",
          },
          cols: 200,
          rows: 50,
          scrollback: 10000,
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          lineHeight: 1.2,
          convertEol: true,
          scrollOnOutput: true,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon());

        terminal.open(terminalContainerRef.current);

        setTimeout(() => {
          fitAddon.fit();
        }, 0);

        terminalRef.current = terminal;
        terminalRef.current.fitAddon = fitAddon;

        const handleResize = () => {
          fitAddon.fit();
        };

        window.addEventListener("resize", handleResize);

        terminalRef.current.cleanup = () => {
          window.removeEventListener("resize", handleResize);
          terminal.dispose();
        };
      } else {
        if (terminalRef.current.fitAddon) {
          terminalRef.current.fitAddon.fit();
        }
      }

      await window.electronAPI.connectSSH(server);
      setIsConnected(true);
      setSelectedServer(server);
      message.success("SSH连接成功");

      window.electronAPI.removeAllListeners?.("ssh-data");
      window.electronAPI.removeAllListeners?.("ssh-closed");

      window.electronAPI.onSSHData((data) => {
        if (terminalRef.current) {
          terminalRef.current.write(data);
          terminalRef.current.scrollToBottom();
        }
      });

      window.electronAPI.onSSHClosed(() => {
        disconnectSSH();
      });

      terminalRef.current?.onData((data) => {
        window.electronAPI.sendSSHData(data);
      });
    } catch (error) {
      message.error("连接失败: " + error.message);
      setIsConnected(false);
    }
  };

  const disconnectSSH = async () => {
    try {
      window.electronAPI.removeAllListeners?.("ssh-data");
      window.electronAPI.removeAllListeners?.("ssh-closed");

      await window.electronAPI.disconnectSSH();
      setIsConnected(false);
      setSelectedServer(null);
      if (terminalRef.current) {
        terminalRef.current.clear();
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      message.success("已断开连接");
      window.location.reload();
    } catch (error) {
      message.error("断开连接失败: " + error.message);
    }
  };

  const viewLiveLog = async (server) => {
    try {
      if (!isConnected || selectedServer?.id !== server.id) {
        await connectSSH(server);
      }
      terminalRef.current?.clear();
      await window.electronAPI.sendSSHData(`tail -f ${server.logPath}\n`);
    } catch (error) {
      message.error("查看实时日志失败: " + error.message);
    }
  };

  const searchLog = async (server) => {
    let inputRef = null;
    Modal.confirm({
      title: "日志搜索",
      content: (
        <Input
          ref={(node) => (inputRef = node)}
          placeholder="请输入搜索关键词"
        />
      ),
      onOk: async () => {
        const keyword = inputRef?.input?.value;
        if (!keyword) {
          message.error("请输入搜索关键词");
          return;
        }
        try {
          terminalRef.current?.clear();

          if (!isConnected || selectedServer?.id !== server.id) {
            await connectSSH(server);
          }
          await window.electronAPI.sendSSHData(
            `grep -n "${keyword}" ${server.logPath}\n`
          );
        } catch (error) {
          message.error("搜索日志失败: " + error.message);
        }
      },
    });
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

  return (
    <Layout className="app-container">
      <Header className="app-header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
          }}
        >
          <Title level={4} style={{ margin: "16px 0", color: "#1890ff" }}>
            远程服务器日志查询工具
          </Title>
          <Text style={{ marginLeft: "16px", color: "#1890ff" }}>v1.0.0</Text>
          <Text style={{ marginLeft: "16px", color: "#1890ff" }}>作者: KK</Text>
        </div>
      </Header>
      <Content className="app-content">
        <Spin spinning={loading} tip="加载中..." size="large">
          <div className="server-list">
            <Space style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => showModal()}
              >
                添加服务器
              </Button>
            </Space>
            <Table
              columns={columns}
              dataSource={servers}
              rowKey="id"
              onRow={(record) => ({
                onClick: () => setSelectedServer(record),
              })}
              rowClassName={(record) =>
                record.id === selectedServer?.id ? "ant-table-row-selected" : ""
              }
            />
          </div>

          <Card
            className="terminal-container"
            style={{
              display: isConnected ? "block" : "none",
              marginBottom: "24px",
              padding: "0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "8px",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <Button
                type="primary"
                icon={<CopyOutlined />}
                onClick={() => {
                  if (terminalRef.current) {
                    const buffer = terminalRef.current.buffer.active;
                    const lines = [];
                    for (let i = 0; i < buffer.length; i++) {
                      const line = buffer.getLine(i);
                      if (line) {
                        lines.push(line.translateToString());
                      }
                    }
                    const content = lines.join("\n");
                    navigator.clipboard
                      .writeText(content)
                      .then(() => {
                        message.success("复制成功");
                      })
                      .catch(() => {
                        message.error("复制失败");
                      });
                  }
                }}
              >
                复制内容
              </Button>
            </div>
            <div
              ref={terminalContainerRef}
              style={{
                height: "calc(100% - 50px)",
                padding: "8px",
                backgroundColor: "#1e1e1e",
                borderRadius: "0 0 8px 8px",
                overflow: "hidden",
              }}
            />
          </Card>

          <Modal
            title={`${editingServer ? "编辑" : "添加"}服务器配置`}
            open={isModalVisible}
            onOk={handleSubmit}
            onCancel={handleCancel}
            destroyOnClose
          >
            <Form form={form} layout="vertical">
              <Form.Item
                name="name"
                label="服务器名称"
                rules={[{ required: true, message: "请输入服务器名称" }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="host"
                label="主机地址"
                rules={[{ required: true, message: "请输入主机地址" }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="port"
                label="端口"
                initialValue="22"
                rules={[{ required: true, message: "请输入端口号" }]}
              >
                <Input type="number" />
              </Form.Item>
              <Form.Item
                name="username"
                label="用户名"
                rules={[{ required: true, message: "请输入用户名" }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[{ required: true, message: "请输入密码" }]}
              >
                <Input.Password />
              </Form.Item>
              <Form.Item
                name="logPath"
                label="日志路径"
                rules={[{ required: true, message: "请输入日志路径" }]}
              >
                <Input />
              </Form.Item>
              <Form.Item name="remark" label="备注">
                <Input.TextArea />
              </Form.Item>
            </Form>
          </Modal>
        </Spin>
      </Content>
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
