"""
Cliente da API HTTP do FlightGear (fgfs --httpd=PORTA).

Endpoints usados (src/Network/http no código do FlightGear):
- GET  /json/<caminho>?d=N  lê um nó da árvore de propriedades (N níveis de filhos)
- POST /json/<caminho>      grava {"value": ...}; com "name"/"index" cria o filho se faltar
- POST /run.cgi?value=CMD   executa um fgcommand, com os argumentos em JSON no corpo
- GET  /screenshot?type=jpg captura a tela do simulador
"""

from __future__ import annotations

import asyncio
import os
import re
from typing import Any

import httpx
from mcp.server.mcpserver.exceptions import ToolError

_INDEXED = re.compile(r"^(?P<name>[^\[\]]+)(?:\[(?P<index>\d+)\])?$")


class FlightGearError(ToolError):
    """Erro esperado (simulador fechado, caminho inválido...); a mensagem chega ao cliente MCP."""


def _as_prop_tree(args: dict[str, Any]) -> dict[str, Any]:
    """{"a": 1, "b": {"c": 2}, "d": [3, 4]} -> formato name/value/children que o FlightGear entende."""
    children = []
    for name, value in args.items():
        for index, item in enumerate(value if isinstance(value, list) else [value]):
            node = {"name": name, "index": index}
            node.update(_as_prop_tree(item) if isinstance(item, dict) else {"value": item})
            children.append(node)
    return {"children": children}


def _normalize(path: str) -> str:
    path = "/" + path.strip().strip("/")
    return path if path != "/" else ""


class FlightGearClient:
    def __init__(self, host: str | None = None, port: int | None = None, timeout: float | None = None) -> None:
        self.host = host or os.getenv("FG_HTTP_HOST", "127.0.0.1")
        self.port = port or int(os.getenv("FG_HTTP_PORT", "8080"))
        self.base_url = f"http://{self.host}:{self.port}"
        self._http = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout or float(os.getenv("FG_HTTP_TIMEOUT", "5.0")),
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        try:
            return await self._http.request(method, url, **kwargs)
        except httpx.TransportError as exc:
            raise FlightGearError(
                f"Sem conexão com o FlightGear em {self.base_url} ({exc.__class__.__name__}). "
                f"Abra o simulador com --httpd={self.port}."
            ) from exc

    @staticmethod
    def _check(resp: httpx.Response) -> None:
        if resp.is_error:
            raise FlightGearError(f"FlightGear respondeu {resp.status_code} em {resp.request.url.path}: {resp.text[:200]}")

    async def get_node(self, path: str, depth: int = 1) -> dict[str, Any] | None:
        """Nó cru da árvore (com 'children' se depth > 1), ou None se não existir."""
        resp = await self._request("GET", f"/json{_normalize(path)}", params={"d": max(1, depth)})
        if resp.status_code == 404:
            return None
        self._check(resp)
        return resp.json()

    async def get(self, path: str, default: Any = None) -> Any:
        node = await self.get_node(path)
        if node is None:
            return default
        return node.get("value", default)

    async def get_many(self, paths: dict[str, str]) -> dict[str, Any]:
        """Lê várias propriedades em paralelo: {rótulo: caminho} -> {rótulo: valor}."""
        values = await asyncio.gather(*(self.get(p) for p in paths.values()))
        return dict(zip(paths.keys(), values))

    async def set(self, path: str, value: Any) -> None:
        """Grava a partir da raiz com name/index aninhados, assim o caminho todo é criado se faltar."""
        path = _normalize(path)
        body: dict[str, Any] | None = None
        for part in reversed(path.split("/")[1:]):
            match = _INDEXED.match(part)
            if not match:
                raise FlightGearError(f"Caminho inválido: {path!r}")
            node = {"name": match["name"], "index": int(match["index"] or 0)}
            body = {**node, "value": value} if body is None else {**node, "children": [body]}
        if body is None:
            raise FlightGearError("Não dá para gravar na raiz.")
        resp = await self._request("POST", "/json/", json={"children": [body]})
        self._check(resp)

    async def run_command(self, command: str, args: dict[str, Any] | None = None) -> str:
        resp = await self._request("POST", "/run.cgi", params={"value": command}, json=_as_prop_tree(args or {}))
        if resp.status_code != 200:
            raise FlightGearError(resp.text or f"fgcommand {command!r} falhou ({resp.status_code})")
        return resp.text

    async def screenshot(self, fmt: str = "jpg") -> bytes:
        resp = await self._request("GET", "/screenshot", params={"type": fmt}, timeout=15.0)
        self._check(resp)
        return resp.content
