<?php

declare(strict_types=1);

final class ApiClient
{
    private string $baseUrl;

    public function __construct(string $baseUrl)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    public function getBaseUrl(): string
    {
        return $this->baseUrl;
    }

    public function sheetUrl(): string
    {
        return $this->baseUrl . '/sheet';
    }

    public function health(): array
    {
        return $this->request('GET', '/health');
    }

    public function meta(): array
    {
        return $this->request('GET', '/api/meta');
    }

    public function upload(string $endpoint, string $filePath): array
    {
        if (!is_file($filePath)) {
            return ['ok' => false, 'error' => 'File tidak ditemukan: ' . $filePath];
        }
        return $this->uploadContent($endpoint, (string) file_get_contents($filePath));
    }

    public function uploadContent(string $endpoint, string $content): array
    {
        if (trim($content) === '') {
            return ['ok' => false, 'error' => 'Konten file kosong'];
        }

        if (function_exists('curl_init')) {
            return $this->curlUpload($endpoint, $content);
        }

        return $this->streamUpload($endpoint, $content);
    }

    private function request(string $method, string $path): array
    {
        $url = $this->baseUrl . $path;

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TIMEOUT => 30,
            ]);
            $body = curl_exec($ch);
            $errno = curl_errno($ch);
            $error = curl_error($ch);
            $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($errno !== 0) {
                return ['ok' => false, 'error' => "API tidak dapat dihubungi: $error"];
            }

            $json = json_decode((string) $body, true);
            if (!is_array($json)) {
                return ['ok' => false, 'error' => "Response tidak valid (HTTP $http)"];
            }
            if ($http >= 400 && !isset($json['error'])) {
                $json['error'] = 'HTTP ' . $http;
                $json['ok'] = false;
            }
            return $json;
        }

        $ctx = stream_context_create([
            'http' => [
                'method' => $method,
                'timeout' => 30,
                'ignore_errors' => true,
            ],
        ]);
        $body = @file_get_contents($url, false, $ctx);
        $json = json_decode((string) $body, true);
        return is_array($json) ? $json : ['ok' => false, 'error' => 'API tidak dapat dihubungi'];
    }

    private function curlUpload(string $endpoint, string $content): array
    {
        $url = $this->baseUrl . $endpoint;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $content,
            CURLOPT_HTTPHEADER => ['Content-Type: text/plain; charset=utf-8'],
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 60,
        ]);
        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            return ['ok' => false, 'error' => "Upload gagal: $error"];
        }

        $json = json_decode((string) $body, true);
        if (!is_array($json)) {
            return ['ok' => false, 'error' => "Response tidak valid (HTTP $http)"];
        }
        return $json;
    }

    private function streamUpload(string $endpoint, string $content): array
    {
        $url = $this->baseUrl . $endpoint;
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: text/plain; charset=utf-8\r\n",
                'content' => $content,
                'timeout' => 60,
                'ignore_errors' => true,
            ],
        ]);
        $body = @file_get_contents($url, false, $ctx);
        $json = json_decode((string) $body, true);
        return is_array($json) ? $json : ['ok' => false, 'error' => 'Upload gagal'];
    }
}