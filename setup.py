#!/usr/bin/env python3
"""
多功能站长工具箱 - 安装脚本
"""

from setuptools import setup, find_packages

setup(
    name='site-analyzer',
    version='1.0.0',
    description='多功能站长工具箱 - 网站SEO分析、可用性检测、SSL证书检查',
    long_description=open('README.md', encoding='utf-8').read(),
    long_description_content_type='text/markdown',
    author='Your Name',
    author_email='your@email.com',
    url='https://github.com/yourusername/site-analyzer',
    py_modules=['analyzer'],
    install_requires=[
        'requests>=2.28.0',
        'beautifulsoup4>=4.11.0',
    ],
    entry_points={
        'console_scripts': [
            'site-analyzer=analyzer:main',
        ],
    },
    classifiers=[
        'Development Status :: 4 - Beta',
        'Intended Audience :: Developers',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
        'Topic :: Internet :: WWW/HTTP',
        'Topic :: Software Development :: Libraries :: Python Modules',
    ],
    python_requires='>=3.8',
)
